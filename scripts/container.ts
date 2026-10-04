// The image's entry point (Dockerfile). `pnpm build:start` bundles it with its dependencies into dist/start.mjs, because
// the standalone server carries only the packages the server itself loads; pg is one of them and stays outside.
import { main } from './start.ts'

main()
