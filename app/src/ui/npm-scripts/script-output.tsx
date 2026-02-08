import * as React from 'react'

interface IScriptOutputProps {
  readonly output: string
}

export class ScriptOutput extends React.Component<IScriptOutputProps> {
  private outputRef = React.createRef<HTMLPreElement>()

  public componentDidUpdate() {
    const el = this.outputRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }

  public render() {
    return (
      <pre className="script-output" ref={this.outputRef}>
        {this.props.output}
      </pre>
    )
  }
}
