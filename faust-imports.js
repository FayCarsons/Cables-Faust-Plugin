// NOTE:(@faycarsons) this file is used to compile and treeshake faustwasm
// so that we only include what's necessary in the cables operator

import {
  instantiateFaustModule,
  FaustWasmInstantiator,
  FaustMonoWebAudioDsp,
  LibFaust,
  FaustCompiler,
  FaustPolyDspGenerator,
  FaustMonoDspGenerator,
} from '@grame/faustwasm/dist/esm-bundle/index'

export default {
  instantiateFaustModule,
  FaustWasmInstantiator,
  FaustMonoWebAudioDsp,
  LibFaust,
  FaustCompiler,
  FaustPolyDspGenerator,
  FaustMonoDspGenerator,
}
