import resolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import typescript from '@rollup/plugin-typescript'
import { terser } from 'rollup-plugin-terser'

export default {
  input: 'faust-imports.js', // Entry point for the library
  output: {
    file: 'dist/tiny-faustwasm.js',
    format: 'es', // ES module format
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript(),
    terser(), // Minify the output
  ],
}
