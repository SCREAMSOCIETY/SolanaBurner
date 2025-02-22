use actix_web::{middleware, web, App, HttpServer, HttpResponse};
use std::io;

#[actix_web::main]
async fn main() -> io::Result<()> {
    std::env::set_var("RUST_LOG", "debug");
    env_logger::init();

    let port = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(5000);

    println!("Starting minimal server at http://0.0.0.0:{}", port);

    match HttpServer::new(move || {
        println!("Creating new app instance");
        App::new()
            .wrap(middleware::Logger::default())
            .route("/", web::get().to(|| async { 
                HttpResponse::Ok().body("Server is running!")
            }))
    })
    .bind(("0.0.0.0", port)) {
        Ok(server) => {
            println!("Successfully bound to port {}", port);
            server.workers(1)
                .run()
                .await
        },
        Err(e) => {
            eprintln!("Failed to bind to port {}: {}", port, e);
            Err(e)
        }
    }
}