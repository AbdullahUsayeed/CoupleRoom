import { io } from 'socket.io-client';

// Media options shared by every RTCPeerConnection we create.
var ICE_OPTS = {
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Used only if /api/turn-credentials cannot be reached. STUN alone cannot
// relay media, but public STUN servers still let most direct connections form.
var FALLBACK_ICE = {
  iceServers: [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun.cloudflare.com:3478'
      ]
    }
  ]
};

function withIceOpts(config) {
  var next = Object.assign({}, config);
  next.iceCandidatePoolSize = ICE_OPTS.iceCandidatePoolSize;
  next.bundlePolicy = ICE_OPTS.bundlePolicy;
  next.rtcpMuxPolicy = ICE_OPTS.rtcpMuxPolicy;
  return next;
}

export function initCall(options) {
  var opts = options || {};
  var ROOM = opts.room || 'couple-room';

  var els = {};
  var socket = null;
  var pc = null;
  var localStream = null;
  var remoteStream = null;
  var pending = [];
  var peerId = null;
  var isCaller = false;
  var state = 'idle'; // idle | calling | incoming | connecting | connected
  var micOn = true;
  var camOn = true;
  var remoteHasVideo = false;
  var connTimer = null;
  var iceRetried = false;

  var iceConfig = withIceOpts(FALLBACK_ICE);
  var icePromise = null;
  var destroyed = false;

  function loadIce() {
    if (icePromise) return icePromise;
    icePromise = new Promise(function (resolve) {
      var done = false;
      function finish(config) {
        if (done) return;
        done = true;
        resolve(config);
      }
      var timer = setTimeout(function () { finish(iceConfig); }, 4000);
      try {
        fetch('/api/turn-credentials', { cache: 'no-store' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (d) {
            clearTimeout(timer);
            if (d && d.iceServers && d.iceServers.length) {
              iceConfig = withIceOpts({ iceServers: d.iceServers });
            }
            finish(iceConfig);
          })
          .catch(function () { clearTimeout(timer); finish(iceConfig); });
      } catch (e) {
        clearTimeout(timer);
        finish(iceConfig);
      }
    });
    return icePromise;
  }

  function clearWatch() { if (connTimer) { clearTimeout(connTimer); connTimer = null; } }
  function armWatch(ms, fn) { clearWatch(); connTimer = setTimeout(fn, ms); }

  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }

  function setStatus(text, err) {
    if (!els.status) return;
    els.status.textContent = text || '';
    els.status.className = 'call-status' + (err ? ' err' : '');
  }

  function attach(stream, video) {
    if (!video) return;
    try { video.srcObject = stream; } catch (e) { /* ignore */ }
    if (video.play) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function render() {
    if (!els.panel) return;
    var inCallLike = state === 'calling' || state === 'connecting' || state === 'connected';
    show(els.start, state === 'idle');
    show(els.answer, state === 'incoming');
    show(els.decline, state === 'incoming');
    show(els.mic, state === 'connected');
    show(els.cam, state === 'connected');
    show(els.end, inCallLike || state === 'incoming');
    if (els.mic) els.mic.classList.toggle('off', !micOn);
    if (els.cam) els.cam.classList.toggle('off', !camOn);
    if (els.remotePh) els.remotePh.classList.toggle('hidden', state === 'connected' && remoteHasVideo);
    if (els.localPh) els.localPh.classList.toggle('hidden', !!(localStream && camOn));
    if (els.remoteTile) els.remoteTile.classList.toggle('voice', state === 'connected' && !remoteHasVideo);
  }

  function setState(s) { state = s; render(); }

  function describeMediaError(e) {
    if (!e) return 'camera/mic unavailable';
    if (e.name === 'NoMediaDevices') return 'camera needs a secure page (https)';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'camera/mic permission blocked';
    if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') return 'no camera/mic found on this device';
    if (e.name === 'NotReadableError' || e.name === 'TrackStartError') return 'camera/mic is busy in another app';
    if (e.name === 'OverconstrainedError') return 'camera settings not supported';
    return 'camera/mic error: ' + (e.name || e.message || 'unknown');
  }

  function mediaFailed(e) {
    console.error('getUserMedia failed', e);
    setStatus(describeMediaError(e) + ' — tap again to retry', true);
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then(function (devs) {
          var cams = devs.filter(function (d) { return d.kind === 'videoinput'; }).length;
          var mics = devs.filter(function (d) { return d.kind === 'audioinput'; }).length;
          if (!cams && !mics) {
            setStatus('this browser sees no camera or microphone — open the link in Chrome on your phone, or check the OS privacy settings', true);
          } else {
            setStatus('found ' + cams + ' camera(s), ' + mics + ' mic(s) — allow permission and tap call', true);
          }
        }).catch(function () {});
      }
    } catch (ignore) { /* permissions api unsupported */ }
  }

  function getMedia() {
    if (localStream) return Promise.resolve(localStream);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var err = new Error('navigator.mediaDevices unavailable');
      err.name = 'NoMediaDevices';
      return Promise.reject(err);
    }
    var attempts = [
      { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: { echoCancellation: true, noiseSuppression: true } },
      { video: true, audio: true },
      { video: true },
      { audio: true }
    ];
    function attempt(i, lastErr) {
      if (i >= attempts.length) return Promise.reject(lastErr || new Error('no camera/mic'));
      return navigator.mediaDevices.getUserMedia(attempts[i]).then(function (stream) {
        localStream = stream;
        micOn = stream.getAudioTracks().length > 0;
        camOn = stream.getVideoTracks().length > 0;
        attach(localStream, els.local);
        return localStream;
      }, function (mErr) {
        return attempt(i + 1, mErr);
      });
    }
    return attempt(0, null);
  }

  function stopLocal() {
    if (localStream) {
      localStream.getTracks().forEach(function (t) { t.stop(); });
      localStream = null;
    }
    if (els.local) els.local.srcObject = null;
  }

  function send(kind, payload, to) {
    if (!socket) return;
    socket.emit('call:signal', { kind: kind, payload: payload, to: to });
  }

  function closePc() {
    clearWatch();
    if (pc) {
      try { pc.close(); } catch (e) { /* ignore */ }
      pc = null;
    }
    pending = [];
    remoteHasVideo = false;
    iceRetried = false;
  }

  function createPc() {
    closePc();
    pc = new RTCPeerConnection(iceConfig);
    remoteStream = new MediaStream();
    attach(remoteStream, els.remote);
    if (localStream) localStream.getTracks().forEach(function (t) { pc.addTrack(t, localStream); });

    pc.onicecandidate = function (e) {
      if (e.candidate) send('ice', { candidate: e.candidate }, peerId);
    };
    pc.ontrack = function (e) {
      if (e.streams && e.streams[0]) {
        remoteStream = e.streams[0];
      } else if (e.track && remoteStream.getTracks().indexOf(e.track) === -1) {
        remoteStream.addTrack(e.track);
      }
      attach(remoteStream, els.remote);
      remoteHasVideo = remoteStream.getVideoTracks().length > 0;
      if (e.track && e.track.kind === 'video') {
        e.track.onmute = function () { remoteHasVideo = false; render(); };
        e.track.onunmute = function () { remoteHasVideo = true; render(); };
      }
      render();
    };
    pc.onconnectionstatechange = function () {
      var st = pc && pc.connectionState;
      if (st === 'connected') {
        clearWatch();
        setState('connected');
        setStatus('connected');
      } else if (st === 'connecting' || st === 'new') {
        if (state !== 'calling') setStatus('connecting…');
        armWatch(25000, onConnectTimeout);
      } else if (st === 'failed') {
        handleIceFailure();
      } else if (st === 'disconnected') {
        setStatus('reconnecting…');
        armWatch(15000, onConnectTimeout);
      }
    };
    return pc;
  }

  // If ICE fails (common behind NAT), retry once through the TURN relay by
  // restarting ICE and re-offering. Only the caller renegotiates.
  function handleIceFailure() {
    if (!iceRetried && pc && peerId) {
      iceRetried = true;
      setStatus('connection blocked — retrying through relay…');
      armWatch(20000, failConn);
      try {
        if (pc.restartIce) pc.restartIce();
        if (isCaller) {
          pc.createOffer({ iceRestart: true }).then(function (offer) {
            return pc.setLocalDescription(offer);
          }).then(function () {
            send('offer', { sdp: pc.localDescription }, peerId);
          }).catch(failConn);
        }
        return;
      } catch (e) { /* fall through */ }
    }
    failConn();
  }

  function onConnectTimeout() {
    if (state === 'connected') return;
    handleIceFailure();
  }

  function failConn() {
    if (state === 'idle') return;
    setStatus('could not connect — check both devices are online and allow camera/mic', true);
    end(false);
  }

  function drain() {
    if (!pc || !pc.remoteDescription) return Promise.resolve();
    var q = pending.slice();
    pending = [];
    return Promise.all(q.map(function (c) {
      return pc.addIceCandidate(c).catch(function () {});
    }));
  }

  function startCall() {
    Promise.all([getMedia(), loadIce()]).then(function () {
      if (destroyed) return;
      isCaller = true;
      createPc();
      setState('calling');
      setStatus('calling…');
      send('invite', {});
    }).catch(mediaFailed);
  }

  function acceptCall() {
    Promise.all([getMedia(), loadIce()]).then(function () {
      if (destroyed) return;
      isCaller = false;
      createPc();
      setState('connecting');
      setStatus('connecting…');
      send('accept', {}, peerId);
    }).catch(mediaFailed);
  }

  function end(notifyPeer) {
    if (notifyPeer !== false) send('hangup', {});
    closePc();
    stopLocal();
    if (els.remote) els.remote.srcObject = null;
    setState('idle');
    setStatus('call ended');
    setTimeout(function () { if (state === 'idle') setStatus(''); }, 2500);
  }

  function handleSignal(msg) {
    if (!msg || !msg.kind) return;
    if (msg.from) peerId = msg.from;

    if (msg.kind === 'invite') {
      if (state === 'idle') { setState('incoming'); setStatus('incoming call…'); }
      return;
    }
    if (msg.kind === 'accept') {
      if (isCaller && pc) {
        setState('connecting');
        pc.createOffer().then(function (offer) {
          return pc.setLocalDescription(offer).then(function () {
            send('offer', { sdp: pc.localDescription }, peerId);
          });
        }).catch(function (e) { console.error('offer', e); });
      }
      return;
    }
    if (msg.kind === 'offer') {
      Promise.resolve().then(function () {
        if (!pc && state === 'incoming') return acceptCall();
        return null;
      }).then(function () {
        if (!pc) return null;
        return pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp))
          .then(drain)
          .then(function () { return pc.createAnswer(); })
          .then(function (answer) {
            return pc.setLocalDescription(answer).then(function () {
              send('answer', { sdp: pc.localDescription }, peerId);
              setState('connecting');
              setStatus('connecting…');
            });
          });
      }).catch(function (e) { console.error('offer handling', e); });
      return;
    }
    if (msg.kind === 'answer') {
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp))
          .then(drain)
          .catch(function (e) { console.error('answer', e); });
      }
      return;
    }
    if (msg.kind === 'ice') {
      if (pc && pc.remoteDescription) {
        pc.addIceCandidate(msg.payload.candidate).catch(function () {});
      } else {
        pending.push(msg.payload.candidate);
      }
      return;
    }
    if (msg.kind === 'hangup') {
      setStatus('other person left');
      end(false);
    }
  }

  function toggleMic() {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach(function (t) { t.enabled = micOn; });
    render();
  }

  function toggleCam() {
    if (!localStream) return;
    camOn = !camOn;
    localStream.getVideoTracks().forEach(function (t) { t.enabled = camOn; });
    render();
  }

  function initSocket() {
    socket = io('/call', {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    });
    socket.on('connect', function () {
      socket.emit('call:join', { room: ROOM }, function (ack) {
        if (ack && ack.peers && ack.peers.length) setStatus('they are online');
        else setStatus('ready to call');
      });
    });
    socket.on('call:signal', handleSignal);
    socket.on('call:peer-joined', function () {
      if (state === 'calling') send('invite', {});
      else if (state === 'idle') setStatus('they are online');
    });
    socket.on('call:peer-left', function () {
      if (state !== 'idle') { setStatus('other person left'); end(false); }
    });
    socket.on('disconnect', function () {
      if (state !== 'idle') { setStatus('connection lost'); end(false); }
    });
  }

  function bind() {
    els.panel = $('call-panel');
    if (!els.panel) return;
    els.local = $('call-local');
    els.remote = $('call-remote');
    els.localPh = $('call-local-ph');
    els.remotePh = $('call-remote-ph');
    els.remoteTile = $('call-remote-tile');
    els.status = $('call-status');
    els.start = $('call-start');
    els.answer = $('call-answer');
    els.decline = $('call-decline');
    els.mic = $('call-mic');
    els.cam = $('call-cam');
    els.end = $('call-end');

    if (els.start) els.start.addEventListener('click', startCall);
    if (els.answer) els.answer.addEventListener('click', acceptCall);
    if (els.decline) els.decline.addEventListener('click', function () { send('hangup', {}); end(false); });
    if (els.mic) els.mic.addEventListener('click', toggleMic);
    if (els.cam) els.cam.addEventListener('click', toggleCam);
    if (els.end) els.end.addEventListener('click', function () { send('hangup', {}); end(false); });

    render();
    initSocket();
    loadIce();
  }

  bind();

  return function destroy() {
    destroyed = true;
    try { end(false); } catch (e) { /* ignore */ }
    if (socket) {
      try { socket.disconnect(); } catch (e) { /* ignore */ }
      socket = null;
    }
    closePc();
    stopLocal();
  };
}
