import React, { Component } from 'react';
import { initCall } from '../call';

// The call UI lives inside the room page. initCall() wires the DOM below to
// the /call signaling namespace; unmount tears it down again.
class CallPanel extends Component {
  componentDidMount() {
    this.cleanup = initCall({ room: this.props.room });
    const panel = document.getElementById('call-panel');
    if (panel) panel.classList.add('show');
  }

  componentWillUnmount() {
    if (this.cleanup) this.cleanup();
    this.cleanup = null;
  }

  render() {
    return (
      <div id="call-panel">
        <div className="call-tiles">
          <div className="call-tile remote" id="call-remote-tile">
            <video id="call-remote" autoPlay playsInline />
            <div className="call-ph" id="call-remote-ph">🌙 waiting…</div>
            <span className="call-name">them</span>
          </div>
          <div className="call-tile local">
            <video id="call-local" autoPlay playsInline muted />
            <div className="call-ph" id="call-local-ph">you</div>
          </div>
        </div>
        <div className="call-controls">
          <button id="call-start" type="button" title="Start call">📞 call</button>
          <button id="call-answer" className="hidden" type="button" title="Answer">✅</button>
          <button id="call-decline" className="hidden" type="button" title="Decline">✖</button>
          <button id="call-mic" className="hidden" type="button" title="Mute mic">🎤</button>
          <button id="call-cam" className="hidden" type="button" title="Camera">🎥</button>
          <button id="call-end" className="hidden" type="button" title="Hang up">⛔</button>
        </div>
        <div className="call-status" id="call-status"></div>
      </div>
    );
  }
}

export default CallPanel;
