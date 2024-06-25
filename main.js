'use strict'
"esversion: 9";

console.clear();

const DEFAULT_SCRIPT = `import("stdfaust.lib");

// Simple filter ping synth with trigger and frequency
freq = hslider("freq", 440, 10, 10000, 1);
gate = button("gate");

process = gate : ba.impulsify : fi.resonbp(freq, 100, 1.1) : ma.tanh;`;

const faustEditor = op.inStringEditor("Faust Code", DEFAULT_SCRIPT);

const voicing = op.inSwitch("Mode", [Voicing.Mono, Voicing.Poly], Voicing.Mono);
const voices = op.inInt("Voices");
const audioOut = op.outObject("Audio out");

let faustModule;
let node;
const portHandler = new PortHandler();

const ctx = CABLES.WEBAUDIO.createAudioContext(op);

/// Handles switching between monophonic and polyphonic modes
/// @return {void}
voicing.onChange = async () => {
  const voicingVal = voicing.get();

  // If user clicks button for me we are currenttly using, return
  if (node && voicingVal === node.mode) return;
  else {
    // If node has been initialized, disconnect and free previous node before reinitializing
    if (node) node.disconnect();
    node = undefined;
    await compile()
  }
};


/// Handles changes in the number of voices 
/// @return {void}
voices.onChange = async () => {
  const numVoices = voices.get()

  // If value hasn't changed or is invalid, return
  if (node && numVoices === node.voices || numVoices < 1) return;
  else {
    // if node has been initialized, disconnect and free previous node before reinitializing
    if (node) node.disconnect();
    node = undefined
    await compile()
  }

}

/// Compiles Faust program, initializes node and IO
async function compile() {
  if (!faustModule) {
    // NOTE: This seems to be getting called when it shouldn't but isn't causing problems?
    console.error("FaustModule is undefined!");
    return;
  }

  const {
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    compiler,
  } = faustModule;

  // Get Faust program
  const code = faustEditor.get();

  // Get voicing mode
  const voicingVal = voicing.get();

  try {
    // Create generator that compiles and instantiates Web Audio nodes
    let generator;

    if (Voicing.Mono == voicingVal) generator = new FaustMonoDspGenerator()
    else generator = new FaustPolyDspGenerator()

    await generator.compile(compiler, "dsp", code, "");

    // If node has been initialized, disconnect before reinitialization
    if (node) node.disconnect();
    node = await generator.createNode(ctx, voices.get());

    // Set voicing metadata
    node.mode = voicingVal;
    node.numVoices = voices.get()

    // Create IO ports and store references in portHandler
    portHandler.initControl(node)
    portHandler.initAudio(node)

    // Connect to audio context and set audio output
    node.connect(ctx.destination);
    audioOut.setRef(node);
  }
  catch (err) {
    op.setUiError("FaustError", `Error compiling node: ${err}`);
    node.disconnect();
    node = undefined;
    audioOut.set(null);
  }
}

// When Faust script changes, recompile
faustEditor.onChange = async () => {
  await compile()
};

/// imports faustwasm attachment
/// @return {Promise<Module>}
async function importFaustwasm() {
  const blob = new Blob([attachments.faustwasm], { "type": "application/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const module = await import(url);
    return module;
  }
  catch (err) {
    op.setUIError("FaustError", `Error importing FaustWasm: ${err}`);
  }
  finally {
    // Cleanup
    URL.revokeObjectURL(url);
  }
}

op.init = async () => {
  // Get FaustWasm module
  const Faust = await importFaustwasm();

  const {
    instantiateFaustModule,
    LibFaust,
    FaustWasmInstantiator,
    FaustMonoDspGenerator,
    FaustPolyDspGenerator,
    FaustMonoWebAudioDsp,
    FaustCompiler,
  } = Faust;

  try {
    // Create compiler
    const module = await instantiateFaustModule();
    const libFaust = new LibFaust(module);
    const compiler = new FaustCompiler(libFaust);

    // Set global object faustModule so that compiler etc are available everywhere
    faustModule = {
      "compiler": compiler,
      "FaustWasmInstantiator": FaustWasmInstantiator,
      "FaustMonoDspGenerator": FaustMonoDspGenerator,
      "FaustPolyDspGenerator": FaustPolyDspGenerator,
      "FaustMonoWebAudioDsp": FaustMonoWebAudioDsp,
    };

    // Compile current script
    await compile();
  }
  catch (err) {
    op.setUiError("FaustError", `Cannot fetch LibFaust: ${err}`);
  }
};

