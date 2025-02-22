use actix_files as fs;
use actix_web::{
    middleware::Logger,
    web, App, HttpServer,
    Result,
};
use std::path::PathBuf;

async fn index() -> Result<fs::NamedFile> {
    println!("Serving index.html");
    Ok(fs::NamedFile::open("./templates/index.html")?)
}

async fn serve_static_files(path: web::Path<String>) -> Result<fs::NamedFile> {
    let mut file_path: PathBuf = PathBuf::from("static");
    file_path.push(path.into_inner());
    println!("Serving static file: {:?}", file_path);
    Ok(fs::NamedFile::open(file_path)?)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize logger with debug level
    std::env::set_var("RUST_LOG", "debug");
    env_logger::init();

    println!("Starting server at http://0.0.0.0:5000");

    HttpServer::new(|| {
        println!("Creating new server instance");
        App::new()
            .wrap(Logger::default())
            .service(
                web::resource("/")
                    .route(web::get().to(index))
            )
            .service(
                web::scope("/static")
                    .route("/{filename:.*}", web::get().to(serve_static_files))
            )
    })
    .bind(("0.0.0.0", 5000))?
    .run()
    .await
}