use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres};
use std::collections::HashMap;
use std::sync::Arc;
use tower_governor::{governor::GovernorConfigBuilder, GovernorLayer};
use validator::Validate;

#[derive(Serialize, Deserialize, Debug, sqlx::FromRow)]
struct Dev {
    id: i32,
    github_username: String,
    name: Option<String>,
    avatar_url: Option<String>,
    bio: Option<String>,
    techs: Vec<String>,
}

#[derive(Deserialize, Validate)]
struct CreateDevRequest {
    #[validate(length(min = 1))]
    github_username: String,
    #[validate(length(min = 1))]
    techs: String,
    #[validate(range(min = -90.0, max = 90.0))]
    latitude: f64,
    #[validate(range(min = -180.0, max = 180.0))]
    longitude: f64,
}

#[derive(Serialize)]
struct ApiError {
    message: String,
    error_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    extra: Option<serde_json::Value>,
}

enum AppError {
    NotFound(String),
    Internal(String),
    BadRequest(String),
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message, code) = match self {
            AppError::NotFound(m) => (StatusCode::NOT_FOUND, m, "NOT_FOUND"),
            AppError::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m, "INTERNAL_SERVER_ERROR"),
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m, "BAD_REQUEST"),
        };

        let body = Json(ApiError {
            message,
            error_code: code.to_string(),
            extra: None,
        });

        (status, body).into_response()
    }
}

struct AppState {
    db: Pool<Postgres>,
    redis: redis::Client,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "postgresql://postgres:postgres@localhost:5432/devradar".to_string());
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(50)
        .connect(&db_url)
        .await
        .expect("Failed to connect to Postgres");

    let redis_client = redis::Client::open(redis_url).expect("Failed to connect to Redis");

    let state = Arc::new(AppState {
        db: pool,
        redis: redis_client,
    });

    // Rate limiting: 100 requests per minute
    let governor_conf = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(2)
            .burst_size(100)
            .finish()
            .unwrap(),
    );

    let v1_routes = Router::new()
        .route("/devs", get(get_devs).post(create_dev))
        .route("/search", get(search_devs))
        .layer(GovernorLayer { config: governor_conf })
        .with_state(state);

    let app = Router::new().nest("/v1", v1_routes);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:9988").await.unwrap();
    println!("🚀 Rust Backend (Optimized V1) on :9988");
    axum::serve(listener, app).await.unwrap();
}

async fn get_devs(State(state): State<Arc<AppState>>) -> Result<Json<Vec<Dev>>, AppError> {
    let devs = sqlx::query_as::<_, Dev>("SELECT id, github_username, name, avatar_url, bio, techs FROM devs")
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(Json(devs))
}

async fn create_dev(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateDevRequest>,
) -> Result<(StatusCode, Json<Dev>), AppError> {
    payload.validate().map_err(|e| AppError::BadRequest(e.to_string()))?;

    let client = reqwest::Client::new();
    let mut gh_req = client.get(format!("https://api.github.com/users/{}", payload.github_username))
        .header("User-Agent", "DevRadar-Rust");
    
    if let Ok(token) = std::env::var("GITHUB_TOKEN") {
        gh_req = gh_req.header("Authorization", format!("token {}", token));
    }

    let gh_res = gh_req.send().await.map_err(|e| AppError::Internal(e.to_string()))?
        .json::<serde_json::Value>().await.map_err(|e| AppError::Internal(e.to_string()))?;

    let name = gh_res["name"].as_str().or(gh_res["login"].as_str()).map(|s| s.to_string());
    let avatar_url = gh_res["avatar_url"].as_str().map(|s| s.to_string());
    let bio = gh_res["bio"].as_str().map(|s| s.to_string());
    let techs: Vec<String> = payload.techs.split(',').map(|s| s.trim().to_string()).collect();

    let dev = sqlx::query_as::<_, Dev>(
        "INSERT INTO devs (github_username, name, avatar_url, bio, techs, location, geometry_location) 
         VALUES ($1, $2, $3, $4, $5, ST_MakePoint($6, $7)::geography, ST_Transform(ST_SetSRID(ST_MakePoint($6, $7), 4326), 3857)) 
         RETURNING id, github_username, name, avatar_url, bio, techs"
    )
    .bind(&payload.github_username)
    .bind(name)
    .bind(avatar_url)
    .bind(bio)
    .bind(&techs)
    .bind(payload.longitude)
    .bind(payload.latitude)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok((StatusCode::CREATED, Json(dev)))
}

async fn search_devs(
    State(state): State<Arc<AppState>>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Vec<Dev>>, AppError> {
    let lat_str = params.get("latitude").ok_or_else(|| AppError::BadRequest("Missing latitude".to_string()))?;
    let lon_str = params.get("longitude").ok_or_else(|| AppError::BadRequest("Missing longitude".to_string()))?;
    let techs_str = params.get("techs").ok_or_else(|| AppError::BadRequest("Missing techs".to_string()))?;

    let cache_key = format!("search:{}:{}:{}", lat_str, lon_str, techs_str);
    let mut redis_conn = state.redis.get_async_connection().await.map_err(|e| AppError::Internal(e.to_string()))?;
    
    if let Ok(cached) = redis_conn.get::<_, String>(&cache_key).await {
        if let Ok(devs) = serde_json::from_str::<Vec<Dev>>(&cached) {
            return Ok(Json(devs));
        }
    }

    let lat: f64 = lat_str.parse().map_err(|_| AppError::BadRequest("Invalid latitude".to_string()))?;
    let lon: f64 = lon_str.parse().map_err(|_| AppError::BadRequest("Invalid longitude".to_string()))?;
    let techs: Vec<String> = techs_str.split(',').map(|s| s.trim().to_string()).collect();

    let devs = sqlx::query_as::<_, Dev>(
        "SELECT id, github_username, name, avatar_url, bio, techs 
         FROM devs WHERE techs && $1 AND ST_DWithin(geometry_location, ST_Transform(ST_SetSRID(ST_MakePoint($2, $3), 4326), 3857), 10000)"
    )
    .bind(techs)
    .bind(lon)
    .bind(lat)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.to_string()))?;

    if let Ok(serialized) = serde_json::to_string(&devs) {
        let _: () = redis_conn.set_ex(cache_key, serialized, 60).await.unwrap_or_default();
    }

    Ok(Json(devs))
}
