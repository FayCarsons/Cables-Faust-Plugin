// NOTE:(@faycarsons) this file is used to compile and treeshake faustwasm 
// so that we only include what's necessary in the cables operator

import { instantiateFaustModuleFromFile, FaustWasmInstantiator, FaustMonoWebAudioDsp, LibFaust, FaustCompiler, FaustPolyDspGenerator, FaustMonoDspGenerator } from '@grame/faustwasm'

export default { instantiateFaustModuleFromFile, FaustWasmInstantiator, FaustMonoWebAudioDsp, LibFaust, FaustCompiler, FaustPolyDspGenerator, FaustMonoDspGenerator }
