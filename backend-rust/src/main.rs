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
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    
    let pool = PgPoolOptions::new()
        .max_connections(50)
        .connect(&db_url)
        .await
        .unwrap();

    // V1 API VERSIONING
    let v1_routes = Router::new()
        .route("/devs", get(get_devs).post(create_dev))
        .route("/search", get(search_devs))
        .with_state(Arc::new(pool));

    let app = Router::new().nest("/v1", v1_routes);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:9988").await.unwrap();
    println!("🚀 Rust Backend (V1) on :9988");
    axum::serve(listener, app).await.unwrap();
}

async fn get_devs() -> Json<Vec<String>> { Json(vec![]) }
async fn create_dev() -> StatusCode { StatusCode::CREATED }
async fn search_devs() -> Json<Vec<String>> { Json(vec![]) }
