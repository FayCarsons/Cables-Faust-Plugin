
"esversion: 9";

console.clear();

// Time to wait to compile after a keystroke
const DEBOUNCE_TIME = 333;

const outTrigger = op.outTrigger("Loaded");
const faustEditor = op.inStringEditor("Faust Code");
op.setPortGroup("Faust script", [faustEditor]);
const voicing = op.inSwitch("Mode", ["Monophonic", "Polyphonic"], "Monophonic");
const voices = op.inInt("Voices");
const note = op.inInt("Note");
const gate = op.inTrigger("Gate");

let faustModule;
let node;
let ctx;
let paramMap;

function MIDItoFreq(midiNote) {
  return (440 / 32) * (2 ** ((midiNote - 9) / 12));
}

gate.onChange = () => {
  if (!node) return;

  const hz = MIDItoFreq(note.get());

  // Play note
};

async function compile() {
  if (!faustModule || !ctx) return;

  const {
    compiler,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
  } = faustModule;

  const code = faustEditor.get();

  // Avoiding using uninitialized variables
  let generator = {
    "Monophonic": () => { return new FaustMonoDspGenerator(); },
    "Polyphonic": () => { return new FaustPolyDspGenerator(); }
  }[voicing.get()]();

  try {
    await generator.compile(compiler, "dsp", code, "");

    node = await {
      "Monophonic": () => { return generator.createNode(ctx); },
      "Polyphonic": () => { return generator.createNode(ctx, voices.get()); }
    }();

    for (const param in node.getParams()) {
      const listener = op.inFloat(param);
      paramMap[param] = listener;
      listener.onChange = () => { return node.setParamValue(param, listener.get()); };
    }

    node.connect(ctx.destination);
  }
  catch (err) {
    op.setUIError("FaustError", err, 2);
    node = null;
  }
}

faustEditor.onChange = () => {
  // Restart the timeout so as to not spawn excessive compiiler processes
  clearInterval(faustEditor.debouncer);
  faustEditor.debouncer = setTimeout(compile, DEBOUNCE_TIME);
};

// Turn a String into a Blob and give it a URL so it may be fetched
function strToResource(s) {
  return URL.createObjectURL(
    new Blob([s], { type: "application/javascript" })
  );
}

async function importFaustwasm() {
  const url = strToResource(attachments.faustwasm);
  try {
    const module = await import(url);
    return module.default;
  }
  catch (err) {
    op.setUIError("FaustError", err, 2);
  }
  finally {
    URL.revokeObjectURL(url);
  }
}

// Runs once on op initialization
op.init = async () => {
  const {
    instantiateFaustModuleFromFile,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = await importFaustwasm();

  const libfaustURL = strToResource(attachments.libfaust);

  try {
    // NOTE: `instantiateFaustModuleFromFile` throws an error: 
    // "failed to asynchronously prepare wasm: CompileError: WebAssembly.instantiate(): 
    // expected magic word 00 61 73 6d, found 0a 76 61 72 @+0"
    const module = await instantiateFaustModuleFromFile(libfaustURL);
    const libFaust = new LibFaust(module);
    const compiler = new FaustCompiler(libFaust);

    faustModule = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };
    ctx = new AudioContext();
  }
  catch (err) {
    op.setUiError("FaustError", `Cannot fetch LibFaust: ${err}`, 2);
  }
  finally {
    URL.revokeObjectURL(libfaustURL);
  }
};

