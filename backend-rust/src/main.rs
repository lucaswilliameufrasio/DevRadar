use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::Stream;
use serde::Deserialize;
use std::{
    collections::HashMap, convert::Infallible, net::SocketAddr, path::PathBuf, sync::Arc,
    time::Duration,
};
use tokio::net::TcpListener;

use axum::extract::{Query, State};
use axum::response::sse::{Event, Sse};
use tokio::sync::mpsc;
use tokio::sync::Mutex;
use futures::stream::StreamExt;

#[derive(Debug, Clone)]
struct AppState {
    clients: Arc<Mutex<HashMap<String, (f64, f64)>>>, // Stores each client's closest point
    points: Arc<Mutex<Vec<(f64, f64)>>>,              // Stores all submitted points
    sse_channels: Arc<Mutex<HashMap<String, mpsc::Sender<Event>>>>, // To send events to clients
}

#[derive(Deserialize)]
struct NewPoint {
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct RegisterClient {
    client_id: String,
    latitude: f64,
    longitude: f64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    dotenvy::dotenv().ok();

    set_default_env_var("PORT", "9988");

    let port = std::env::var("PORT").expect("Application port not defined");

    let state = AppState {
        clients: Arc::new(Mutex::new(HashMap::new())),
        points: Arc::new(Mutex::new(vec![])),
        sse_channels: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = app(state);

    let address = SocketAddr::from(([0, 0, 0, 0], port.parse().unwrap()));
    tracing::debug!("Listening on {}", address);
    let listener = TcpListener::bind(&address).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

fn set_default_env_var(key: &str, value: &str) {
    if std::env::var(key).is_err() {
        std::env::set_var(key, value);
    }
}

fn app(state: AppState) -> Router {
    let assets_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("assets");
    let static_files_service =
        tower_http::services::ServeDir::new(assets_dir).append_index_html_on_directories(true);
    Router::new()
        .fallback_service(static_files_service)
        .route("/sse", get(sse_handler))
        .route("/points", post(add_point_handler))
        .route("/register", post(register_client_handler))
        .with_state(state)
        .layer(tower_http::trace::TraceLayer::new_for_http())
}

async fn register_client_handler(
    State(state): State<AppState>,
    Json(payload): Json<RegisterClient>,
) -> &'static str {
    let mut clients = state.clients.lock().await;
    clients.insert(
        payload.client_id.clone(),
        (payload.latitude, payload.longitude),
    );
    println!(
        "Registered client `{}` with default point",
        payload.client_id.clone()
    );
    println!(
        "Client `{}` registered at location: {}, {}",
        payload.client_id, payload.latitude, payload.longitude
    );
    "Client registered"
}

async fn sse_handler(
    Query(client_id): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, (StatusCode, String)> {
    let client_id = match client_id.get("client_id") {
        Some(id) => id.clone(),
        None => return Err((StatusCode::BAD_REQUEST, "client_id is required".to_string())),
    };

    println!("`{}` connected", client_id);

    // Create a channel to send messages to the client
    let (tx, rx) = mpsc::channel::<Event>(32);

    // Store the channel for this client
    state
        .sse_channels
        .lock()
        .await
        .insert(client_id.clone(), tx);

    // Convert receiver into a stream
    let stream = tokio_stream::wrappers::ReceiverStream::new(rx)
        .map(Ok::<_, Infallible>);

    Ok(Sse::new(stream)
        .keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text("keep-alive-text"),
        ))
}

#[axum::debug_handler]
async fn add_point_handler(
    State(state): State<AppState>,
    Json(new_point): Json<NewPoint>,
) -> impl axum::response::IntoResponse {
    {
        let mut points = state.points.lock().await; // Note .await here
        points.push((new_point.latitude, new_point.longitude));
    }

    // Notify clients
    let clients_clone: HashMap<String, (f64, f64)>;
    {
        let clients = state.clients.lock().await;
        clients_clone = clients.clone(); // Clone the data we need
    }
    for (client_id, closest_point) in clients_clone.iter() {
        let distance_to_new = haversine_distance(
            closest_point.0,
            closest_point.1,
            new_point.latitude,
            new_point.longitude,
        );

        const THRESHOLD_KM: f64 = 2.0;

        if distance_to_new < THRESHOLD_KM {
            if let Some(tx) = state.sse_channels.lock().await.get(client_id) {
                let message = format!(
                    "New point added: {}, {}",
                    new_point.latitude, new_point.longitude
                );
                let event = Event::default().data(message);
                let _ = tx.send(event).await; // Ignore the result to avoid panicking
            }
        }
    }

    (StatusCode::CREATED, Json("Point added"))
}

fn haversine_distance(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let to_radians = |deg: f64| deg * std::f64::consts::PI / 180.0;

    let lat1 = to_radians(lat1);
    let lon1 = to_radians(lon1);
    let lat2 = to_radians(lat2);
    let lon2 = to_radians(lon2);

    let dlat = lat2 - lat1;
    let dlon = lon2 - lon1;

    let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlon / 2.0).sin().powi(2);
    let c = 2.0 * a.sqrt().atan2((1.0 - a).sqrt());

    let earth_radius_km = 6371.0;
    earth_radius_km * c
}
