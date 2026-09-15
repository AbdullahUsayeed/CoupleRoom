import React, { Component } from 'react';
import YouTube from 'react-youtube';
import { io } from 'socket.io-client';
import ChatLayout from './chat/ChatLayout';
import CallPanel from './CallPanel';
import {
  PLAY, PAUSE, SYNC_TIME, SEEK, NEW_VIDEO,
  SYNC_STATE, JOIN_ROOM, SEND_MESSAGE, RECEIVED_MESSAGE, USERS, TYPING, REACTION,
  CHAT_AUTH, CHAT_UNLOCKED
} from '../Constants';

const SOCKET_PATH = '/socket.io';

const playerOpts = {
  height: '100%',
  width: '100%',
  playerVars: {
    rel: 0,
    modestbranding: 1,
    playsinline: 1,
    autoplay: 0,
    fs: 1
  }
};

function extractYouTubeId(input) {
  if (!input) return '';
  const s = String(input).trim();
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([0-9A-Za-z_-]{11})/,
    /^([0-9A-Za-z_-]{11})$/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const m = s.match(patterns[i]);
    if (m) return m[1];
  }
  return '';
}

let reactionSeq = 0;

class VideoScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      socket: null,
      connected: false,
      videoId: '',
      inputUrl: '',
      messages: [],
      users: [],
      typingUser: null,
      reactions: [],
      chatOpen: false,
      chatRequired: false,
      chatVerified: false,
      chatError: null,
      fs: false,
      toast: null
    };
    this.player = null;
    this.remote = false;
    this.typingTimer = null;
    this.toastTimer = null;
    this.rootRef = React.createRef();
  }

  componentDidMount() {
    const socket = io('/movie', {
      path: SOCKET_PATH,
      transports: ['websocket', 'polling']
    });
    this.setState({ socket });
    this.bindSocket(socket);
    document.addEventListener('fullscreenchange', this.onFsChange);
    document.addEventListener('webkitfullscreenchange', this.onFsChange);
  }

  componentWillUnmount() {
    if (this.state.socket) this.state.socket.disconnect();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    document.removeEventListener('fullscreenchange', this.onFsChange);
    document.removeEventListener('webkitfullscreenchange', this.onFsChange);
  }

  setRemote = (ms) => {
    this.remote = true;
    setTimeout(() => { this.remote = false; }, ms || 1000);
  };

  bindSocket(socket) {
    socket.on('connect', () => {
      this.setState({ connected: true });
      socket.emit(JOIN_ROOM, { room: this.props.room, username: this.props.username });
    });

    socket.on('disconnect', () => this.setState({ connected: false }));

    socket.on(PLAY, () => {
      if (!this.player) return;
      this.setRemote(1200);
      this.player.playVideo();
    });

    socket.on(PAUSE, () => {
      if (!this.player) return;
      this.setRemote(1200);
      this.player.pauseVideo();
    });

    socket.on(SYNC_TIME, (t) => this.syncTime(t));

    socket.on(SEEK, (t) => {
      if (!this.player) return;
      this.setRemote(1200);
      this.player.seekTo(t, true);
    });

    socket.on(NEW_VIDEO, (videoId) => {
      this.setState({ videoId });
      if (this.player) {
        this.setRemote(1600);
        this.player.loadVideoById(videoId);
      }
    });

    socket.on(SYNC_STATE, (data) => {
      this.setState({
        videoId: data.videoId || '',
        messages: data.messages || [],
        users: data.users || [],
        chatRequired: !!data.chatRequired,
        chatVerified: !!data.chatVerified
      }, () => {
        if (data.videoId && this.player) {
          this.setRemote(2000);
          this.player.loadVideoById({ videoId: data.videoId, startSeconds: data.currentTime || 0 });
          if (data.playing) {
            setTimeout(() => { if (this.player) this.player.playVideo(); }, 900);
          }
        }
      });
    });

    socket.on(CHAT_UNLOCKED, (res) => {
      if (res && res.ok) {
        this.setState({ chatVerified: true, chatError: null, messages: res.messages || [] });
      } else {
        this.setState({ chatVerified: false, chatError: (res && res.error) || 'could not unlock' });
      }
    });

    socket.on(RECEIVED_MESSAGE, (message) => {
      this.setState((s) => ({ messages: [...s.messages, message] }));
      this.showToast(message);
    });

    socket.on(USERS, (users) => this.setState({ users }));

    socket.on(TYPING, ({ username, isTyping }) => {
      this.setState((s) => {
        if (isTyping) return { typingUser: username };
        return s.typingUser === username ? { typingUser: null } : null;
      });
    });

    socket.on(REACTION, ({ emoji }) => this.spawnReaction(emoji));
  }

  showToast = (message) => {
    if (!message || message.system) return;
    if (message.username === this.props.username) return;
    if (this.state.chatOpen && !this.state.fs) return;
    const id = Date.now() + Math.random();
    this.setState({ toast: { id, username: message.username, text: message.text } });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.setState((s) => (s.toast && s.toast.id === id ? { toast: null } : null));
    }, 5000);
  };

  openChatFromToast = () => this.setState({ chatOpen: true, toast: null });

  onReady = (e) => {
    this.player = e.target;
  };

  onError = () => {
    this.setState({ videoId: '' });
  };

  onStateChange = () => {
    if (!this.player || this.remote) return;
    const socket = this.state.socket;
    if (!socket) return;
    const state = this.player.getPlayerState();
    if (state === 1) {
      socket.emit(SYNC_TIME, this.player.getCurrentTime());
      socket.emit(PLAY);
    } else if (state === 2) {
      socket.emit(PAUSE);
    } else if (state === 3) {
      socket.emit(SYNC_TIME, this.player.getCurrentTime());
    }
  };

  syncTime = (t) => {
    if (!this.player) return;
    const current = this.player.getCurrentTime();
    if (Math.abs(current - t) > 1.2) {
      this.setRemote(1000);
      this.player.seekTo(t, true);
    }
  };

  handleSubmit = (e) => {
    e.preventDefault();
    const id = extractYouTubeId(this.state.inputUrl);
    if (!id) return;
    if (this.state.socket) this.state.socket.emit(NEW_VIDEO, id);
    this.setState({ inputUrl: '' });
  };

  handleUrlChange = (e) => this.setState({ inputUrl: e.target.value });

  authChat = (password) => {
    if (!this.state.socket) return;
    this.setState({ chatError: null });
    this.state.socket.emit(CHAT_AUTH, { password });
  };

  sendMessage = (text) => {
    const clean = (text || '').trim();
    if (!clean || !this.state.socket) return;
    this.state.socket.emit(SEND_MESSAGE, { username: this.props.username, text: clean });
    this.state.socket.emit(TYPING, false);
  };

  handleTyping = (isTyping) => {
    if (!this.state.socket) return;
    this.state.socket.emit(TYPING, !!isTyping);
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (isTyping) {
      this.typingTimer = setTimeout(() => {
        if (this.state.socket) this.state.socket.emit(TYPING, false);
      }, 2500);
    }
  };

  react = (emoji) => {
    this.spawnReaction(emoji);
    if (this.state.socket) this.state.socket.emit(REACTION, emoji);
  };

  spawnReaction = (emoji) => {
    const id = ++reactionSeq;
    const left = 10 + Math.random() * 80;
    this.setState((s) => ({ reactions: [...s.reactions, { id, emoji, left }] }));
    setTimeout(() => {
      this.setState((s) => ({ reactions: s.reactions.filter((r) => r.id !== id) }));
    }, 2600);
  };

  toggleChat = () => this.setState((s) => ({ chatOpen: !s.chatOpen }));
  closeChat = () => this.setState({ chatOpen: false });

  toggleFs = () => {
    const next = !this.state.fs;
    this.setState({ fs: next });
    const el = this.rootRef.current;
    try {
      if (next) {
        if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el && el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitFullscreenElement && document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    } catch (e) { /* fullscreen unsupported: CSS fallback stays active */ }
  };

  onFsChange = () => {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    const isOurRoot = active && active === this.rootRef.current;
    if (this.state.fs && !isOurRoot) this.setState({ fs: false });
  };

  render() {
    const {
      videoId, inputUrl, messages, users, typingUser, reactions,
      chatOpen, connected, chatRequired, chatVerified, chatError, fs, toast
    } = this.state;

    return (
      <div className={`app ${fs ? 'fs' : ''}`} ref={this.rootRef}>
        <header className="app-header">
          <div className="brand"><span className="brand-moon">🌙</span> CoupleRoom</div>
          <div className={`status ${connected ? 'on' : 'off'}`}>
            {connected ? 'together · ' + users.length : 'connecting…'}
          </div>
        </header>

        <main className="layout">
          <section className="stage">
            <div className="tv">
              <div className="tv-bezel">
                <div className="tv-screen">
                  {videoId ? (
                    <YouTube
                      videoId={videoId}
                      opts={playerOpts}
                      onReady={this.onReady}
                      onStateChange={this.onStateChange}
                      onError={this.onError}
                      className="yt-player"
                    />
                  ) : null}
                  <div className="tv-scanlines" />
                  <div className="tv-glare" />
                  <button
                    className="tv-fs-btn"
                    type="button"
                    onClick={this.toggleFs}
                    aria-label={fs ? 'Exit full screen' : 'Full screen'}
                    title={fs ? 'Exit full screen' : 'Full screen'}
                  >
                    {fs ? (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" />
                      </svg>
                    )}
                  </button>
                  {!videoId ? (
                    <div className="tv-empty">
                      <div className="tv-empty-emoji">📼</div>
                      paste a YouTube link to start
                    </div>
                  ) : null}
                </div>
                <div className="tv-base">
                  <span className="tv-knob" />
                  <span className="tv-knob" />
                  <span className="tv-label">OUR · TV</span>
                  <span className="tv-knob" />
                  <span className="tv-knob" />
                </div>
              </div>
            </div>

            <form className="url-form" onSubmit={this.handleSubmit}>
              <input
                className="url-input"
                placeholder="Paste a YouTube link…"
                value={inputUrl}
                onChange={this.handleUrlChange}
                inputMode="url"
              />
              <button className="url-btn" type="submit">play for both</button>
            </form>

            <div className="reactions">
              {['💖', '😂', '😮', '🥰', '🔥', '👏'].map((e) => (
                <button key={e} className="reaction-btn" type="button" onClick={() => this.react(e)}>{e}</button>
              ))}
            </div>
          </section>

          <ChatLayout
            username={this.props.username}
            messages={messages}
            users={users}
            typingUser={typingUser}
            chatOpen={chatOpen}
            chatRequired={chatRequired}
            chatVerified={chatVerified}
            chatError={chatError}
            onAuth={this.authChat}
            onClose={this.closeChat}
            onSend={this.sendMessage}
            onTyping={this.handleTyping}
          />
        </main>

        {!chatOpen ? (
          <button className="chat-toggle" type="button" onClick={this.toggleChat} aria-label="Open chat">💬</button>
        ) : null}

        <div className="reaction-layer" aria-hidden="true">
          {reactions.map((r) => (
            <span key={r.id} className="reaction-float" style={{ left: r.left + '%' }}>{r.emoji}</span>
          ))}
        </div>

        {toast ? (
          <button className="msg-toast" type="button" onClick={this.openChatFromToast}>
            <span className="msg-toast-name">{toast.username}</span>
            <span className="msg-toast-text">{toast.text}</span>
            <span className="msg-toast-hint">tap to reply</span>
          </button>
        ) : null}

        <CallPanel room={this.props.room} />
      </div>
    );
  }
}

export default VideoScreen;
