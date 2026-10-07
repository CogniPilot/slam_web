//! External review harness: actual Modelica -> checked DAE -> issued call table.
//! Compile against a selected isolated worktree, never the production app pin.
use std::{env, fs, path::Path, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.len() != 3 {
        return Err("SOURCE MODEL OUTPUT_DIRECTORY required".into());
    }
    let original = fs::read_to_string(&arguments[0])?;
    fs::create_dir_all(&arguments[2])?;
    for (variant, source) in [
        ("baseline", original.clone()),
        ("gain-two", original.replace("gain = 1.0", "gain = 2.0")),
        ("subtract", original.replace("total + gain*values", "total - gain*values")),
    ].into_iter().filter(|(variant, source)| *variant == "baseline" || source != &original) {
        let start = Instant::now();
        let phase_start = start;
        let _observer = rumoca_compile::compile::install_compile_phase_observer(
            move |phase, event| {
                eprintln!("phase={phase:?} event={event:?} elapsed_ms={:.3}",
                    phase_start.elapsed().as_secs_f64()*1000.0);
            },
        );
        let mut session = rumoca_compile::Session::default();
        let document = Path::new(&arguments[0]).file_name()
            .and_then(|name| name.to_str()).ok_or("SOURCE requires a UTF-8 filename")?;
        session.add_document(document, &source)?;
        eprintln!("phase=CompileModel event=Started variant={variant}");
        let result = session.compile_model(&arguments[1])?;
        eprintln!("phase=CompileModel event=Completed elapsed_ms={:.3}", start.elapsed().as_secs_f64()*1000.0);
        eprintln!("phase=LowerSolve event=Started");
        let table = rumoca_phase_solve::lower_solve_package(&result.dae)?.pure_calls;
        eprintln!("phase=LowerSolve event=Completed elapsed_ms={:.3}", start.elapsed().as_secs_f64()*1000.0);
        let artifact = serde_json::json!({
            "variant": variant,
            "model": arguments[1],
            "source": source,
            "compilerRevision": env::var("RUMOCA_PRODUCER_REVISION")?,
            "compilerSourceSha256": env::var("RUMOCA_PRODUCER_SOURCE_SHA256")?,
            "elapsedMs": start.elapsed().as_secs_f64()*1000.0,
            "table": table,
        });
        let output = Path::new(&arguments[2]).join(format!("{variant}.json"));
        fs::write(output, serde_json::to_string(&artifact)?)?;
        println!("variant={variant} elapsed_ms={:.3} owners={}",
            start.elapsed().as_secs_f64()*1000.0, table.owners().len());
    }
    Ok(())
}
