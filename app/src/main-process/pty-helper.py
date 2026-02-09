#!/usr/bin/env python3
"""
PTY helper script for Gait Desktop.
Creates a real pseudo-terminal and relays I/O between stdin/stdout (pipes from
Node.js) and the PTY file descriptor. This allows proper terminal behavior
(echo, line editing, etc.) even when node-pty is not available.

Usage: python3 pty-helper.py <shell> <cwd> [cols] [rows]
"""
import pty, os, sys, select, struct, fcntl, termios, signal, json

def set_pty_size(fd, cols, rows):
    """Set the PTY window size."""
    try:
        winsize = struct.pack('HHHH', rows, cols, 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

def main():
    if len(sys.argv) < 3:
        print("Usage: pty-helper.py <shell> <cwd> [cols] [rows]", file=sys.stderr)
        sys.exit(1)

    shell = sys.argv[1]
    cwd = sys.argv[2]
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 80
    rows = int(sys.argv[4]) if len(sys.argv) > 4 else 24

    # Change to requested working directory
    try:
        os.chdir(cwd)
    except Exception:
        pass

    pid, fd = pty.fork()

    if pid == 0:
        # Child process - run the shell
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        os.execvpe(shell, [shell], env)
    else:
        # Parent process - relay I/O
        set_pty_size(fd, cols, rows)

        # Handle SIGWINCH-like resize via stdin protocol
        # We use a simple protocol: if stdin receives \x1b[8;<rows>;<cols>t
        # we resize the PTY

        # Make stdin non-blocking
        import fcntl
        flags = fcntl.fcntl(sys.stdin.fileno(), fcntl.F_GETFL)
        fcntl.fcntl(sys.stdin.fileno(), fcntl.F_SETFL, flags | os.O_NONBLOCK)

        # Signal the parent (Node.js) that we're ready
        sys.stdout.buffer.write(b'\x1b]666;ready\x07')
        sys.stdout.buffer.flush()

        try:
            while True:
                try:
                    rlist, _, _ = select.select([sys.stdin.fileno(), fd], [], [], 1.0)
                except select.error:
                    break

                if sys.stdin.fileno() in rlist:
                    try:
                        data = os.read(sys.stdin.fileno(), 65536)
                        if not data:
                            break
                        os.write(fd, data)
                    except OSError:
                        break

                if fd in rlist:
                    try:
                        data = os.read(fd, 65536)
                        if not data:
                            break
                        os.write(sys.stdout.fileno(), data)
                    except OSError:
                        break

        except KeyboardInterrupt:
            pass
        finally:
            os.close(fd)
            try:
                os.kill(pid, signal.SIGTERM)
                os.waitpid(pid, 0)
            except Exception:
                pass

if __name__ == '__main__':
    main()
