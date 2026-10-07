//! Actual-source lowering/emission probe. Never reissues a parsed owner table.
use std::{env, fs, path::Path, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    if arguments.len() != 3 {
        return Err("SOURCE MODEL OUTPUT_DIRECTORY required".into());
    }
    let source = fs::read_to_string(&arguments[0])?;
    let directory = Path::new(&arguments[2]);
    fs::create_dir_all(directory)?;
    let started = Instant::now();
    let mut session = rumoca_compile::Session::default();
    session.add_document("input.mo", &source)?;
    let compilation = session.compile_model(&arguments[1])?;
    eprintln!(
        "CompileModel completed {:.3} ms",
        started.elapsed().as_secs_f64() * 1000.0
    );
    // Structural lowering has no trajectory and does not need input defaults.
    // Every runtime evaluation must still supply the checked declared inputs.
    let package = rumoca_phase_solve::lower_solve_package(&compilation.dae)?;
    eprintln!(
        "LowerSolve completed {:.3} ms",
        started.elapsed().as_secs_f64() * 1000.0
    );
    fs::write(
        directory.join("problem.json"),
        serde_json::to_vec(&package.problem)?,
    )?;
    let continuous = &package.problem.continuous;
    let mut native_bytes = None;
    let mut native_emit_refusal = None;
    let schedule = continuous.refresh_owners.native_assignment_schedule();
    if let Some(schedule) = schedule {
        match rumoca_exec_wasm::compile_native_assignment_schedule_wasm_bytes(
            schedule,
            &package.problem.layout,
        ) {
            Ok(bytes) => {
                native_bytes = Some(bytes.len());
                fs::write(directory.join("native-assignments.wasm"), bytes)?;
            }
            Err(error) => native_emit_refusal = Some(error.to_string()),
        }
    }
    let mut programs = Vec::new();
    for (node, item) in continuous.implicit_rhs.nodes.iter().enumerate() {
        if let rumoca_ir_solve::ComputeNode::ScalarPrograms(block) = item {
            for (program, ops) in block.programs().iter().enumerate() {
                let stores = ops
                    .iter()
                    .enumerate()
                    .filter_map(|(i, op)| {
                        matches!(
                            op,
                            rumoca_ir_solve::LinearOp::StoreOutput { .. }
                                | rumoca_ir_solve::LinearOp::StoreOutputRange { .. }
                        )
                        .then_some(i)
                    })
                    .collect::<Vec<_>>();
                let output_count = rumoca_ir_solve::ScalarProgramBlock::program_output_count(ops);
                let terminal = matches!(
                    ops.last(),
                    Some(rumoca_ir_solve::LinearOp::StoreOutput { .. })
                );
                if output_count != 1 || !terminal {
                    programs.push(serde_json::json!({"node":node,"program":program,
                        "operations":ops.len(),"stores":stores,"outputCount":output_count,
                        "lastOperations":ops.iter().rev().take(4).collect::<Vec<_>>(),
                        "span":block.program_spans().get(program),
                    }));
                }
            }
        }
    }
    let report = serde_json::json!({
        "model":arguments[1],"source":source,
        "compilerRevision":env::var("RUMOCA_PRODUCER_REVISION")?,
        "compilerSourceSha256":env::var("RUMOCA_PRODUCER_SOURCE_SHA256")?,
        "elapsedMs":started.elapsed().as_secs_f64()*1000.0,
        "nativeRefusal":continuous.refresh_owners.native_assignment_refusal().map(ToString::to_string),
        "nativeStages":schedule.map(|schedule|schedule.stages().len()),
        "nativeArtifactBytes":native_bytes,"nativeEmitRefusal":native_emit_refusal,
        "implicitNodes":continuous.implicit_rhs.nodes.len(),"nonSingleTerminalPrograms":programs,
        "scope":"Actual-source structural lowering and optional constructor-issued native emission; no runtime defaults or numerical execution"
    });
    fs::write(
        directory.join("report.json"),
        serde_json::to_vec_pretty(&report)?,
    )?;
    println!(
        "{}",
        serde_json::json!({"nativeRefusal":report["nativeRefusal"],
        "programs":report["nonSingleTerminalPrograms"].as_array().map(Vec::len),
        "nativeStages":report["nativeStages"],"nativeArtifactBytes":report["nativeArtifactBytes"],
        "nativeEmitRefusal":report["nativeEmitRefusal"],
        "elapsedMs":report["elapsedMs"]})
    );
    Ok(())
}
