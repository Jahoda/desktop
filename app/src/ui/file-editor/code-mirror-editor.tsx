import * as React from 'react'
// eslint-disable-next-line no-restricted-imports
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'

// Import language modes statically
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/xml/xml'
import 'codemirror/mode/css/css'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/markdown/markdown'
import 'codemirror/mode/python/python'
import 'codemirror/mode/clike/clike'
import 'codemirror/mode/ruby/ruby'
import 'codemirror/mode/go/go'
import 'codemirror/mode/rust/rust'
import 'codemirror/mode/shell/shell'
import 'codemirror/mode/yaml/yaml'
import 'codemirror/mode/jsx/jsx'
import 'codemirror/mode/sql/sql'
import 'codemirror/mode/php/php'
import 'codemirror/mode/swift/swift'
import 'codemirror/mode/toml/toml'
import 'codemirror/mode/vue/vue'

import { getMimeTypeForPath } from './mime-type'

interface ICodeMirrorEditorProps {
  readonly content: string
  readonly filePath: string
  readonly onContentChanged: (content: string) => void
}

export class CodeMirrorEditor extends React.Component<ICodeMirrorEditorProps> {
  private editorRef = React.createRef<HTMLDivElement>()
  private codeMirror: CodeMirror.Editor | null = null

  public componentDidMount() {
    if (!this.editorRef.current) {
      return
    }

    const mimeType = getMimeTypeForPath(this.props.filePath)

    this.codeMirror = CodeMirror(this.editorRef.current, {
      value: this.props.content,
      mode: mimeType || '',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
    })

    this.codeMirror.on('change', () => {
      if (this.codeMirror) {
        this.props.onContentChanged(this.codeMirror.getValue())
      }
    })
  }

  public componentWillUnmount() {
    this.codeMirror = null
  }

  public render() {
    return <div className="code-mirror-editor-container" ref={this.editorRef} />
  }
}
