import * as Path from 'path'

const extensionMIMEMap = new Map<string, string>([
  ['.ts', 'text/typescript'],
  ['.mts', 'text/typescript'],
  ['.cts', 'text/typescript'],
  ['.js', 'text/javascript'],
  ['.mjs', 'text/javascript'],
  ['.cjs', 'text/javascript'],
  ['.json', 'application/json'],
  ['.tsx', 'text/typescript-jsx'],
  ['.jsx', 'text/jsx'],
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.css', 'text/css'],
  ['.scss', 'text/x-scss'],
  ['.less', 'text/x-less'],
  ['.vue', 'text/x-vue'],
  ['.markdown', 'text/x-markdown'],
  ['.md', 'text/x-markdown'],
  ['.mdx', 'text/x-markdown'],
  ['.yaml', 'text/yaml'],
  ['.yml', 'text/yaml'],
  ['.xml', 'text/xml'],
  ['.svg', 'text/xml'],
  ['.py', 'text/x-python'],
  ['.pyi', 'text/x-python'],
  ['.m', 'text/x-objectivec'],
  ['.scala', 'text/x-scala'],
  ['.cs', 'text/x-csharp'],
  ['.java', 'text/x-java'],
  ['.c', 'text/x-c'],
  ['.h', 'text/x-c'],
  ['.cpp', 'text/x-c++src'],
  ['.hpp', 'text/x-c++src'],
  ['.cc', 'text/x-c++src'],
  ['.kt', 'text/x-kotlin'],
  ['.swift', 'text/x-swift'],
  ['.sh', 'text/x-sh'],
  ['.sql', 'text/x-sql'],
  ['.go', 'text/x-go'],
  ['.php', 'application/x-httpd-php'],
  ['.rb', 'text/x-ruby'],
  ['.rs', 'text/x-rustsrc'],
  ['.r', 'text/x-rsrc'],
  ['.toml', 'text/x-toml'],
  ['.coffee', 'text/x-coffeescript'],
  ['.diff', 'text/x-diff'],
  ['.patch', 'text/x-diff'],
  ['.pl', 'text/x-perl'],
  ['.clj', 'text/x-clojure'],
  ['.ex', 'text/x-elixir'],
  ['.exs', 'text/x-elixir'],
  ['.ps1', 'application/x-powershell'],
  ['.vb', 'text/x-vb'],
  ['.lua', 'text/x-lua'],
  ['.jl', 'text/x-julia'],
  ['.dart', 'application/dart'],
  ['.ini', 'text/x-ini'],
  ['.properties', 'text/x-properties'],
])

const basenameMIMEMap = new Map<string, string>([
  ['dockerfile', 'text/x-dockerfile'],
  ['cargo.lock', 'text/x-toml'],
  ['.gitignore', 'text/x-properties'],
  ['.gitattributes', 'text/x-properties'],
  ['.editorconfig', 'text/x-properties'],
])

export function getMimeTypeForPath(filePath: string): string | undefined {
  const ext = Path.extname(filePath).toLowerCase()
  if (ext) {
    const mimeType = extensionMIMEMap.get(ext)
    if (mimeType) {
      return mimeType
    }
  }

  const basename = Path.basename(filePath).toLowerCase()
  return basenameMIMEMap.get(basename)
}
