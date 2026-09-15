import React, { Component } from 'react';
import VideoScreen from './components/VideoScreen';
import WelcomeScreen from './components/WelcomeScreen';
import { loadConfig } from './config';

const NAME_KEY = 'coupleroom-name';

function readName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

function writeName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* storage unavailable, ignore */
  }
}

class App extends Component {
  state = {
    username: readName(),
    config: null
  };

  componentDidMount() {
    loadConfig().then((config) => this.setState({ config }));
  }

  handleEnter = (username) => {
    const name = (username || '').trim().slice(0, 24) || 'Someone';
    writeName(name);
    this.setState({ username: name });
  };

  render() {
    const { username, config } = this.state;
    if (!config) return <div className="booting">connecting…</div>;
    if (!username) return <WelcomeScreen onEnter={this.handleEnter} />;
    return <VideoScreen username={username} room={config.roomName} config={config} />;
  }
}

export default App;
