(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var busy = false;

  function cookie(name) {
    var parts = document.cookie.split('; ');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (parts[i].slice(0, eq) === name) { return decodeURIComponent(parts[i].slice(eq + 1)); }
    }
    return '';
  }

  function api(path, method, body) {
    var headers = { 'Accept': 'application/json' };
    var init = { method: method || 'GET', credentials: 'same-origin', headers: headers };
    if (init.method !== 'GET') {
      headers['X-XSRF-TOKEN'] = cookie('XSRF-TOKEN');
      if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    }
    return fetch(path, init).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        return { status: res.status, ok: res.ok, body: data };
      });
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function say(text) { $('message').textContent = text; }

  function problemText(res) {
    return (res.body && res.body.detail) ? res.body.detail : ('Request failed (HTTP ' + res.status + ')');
  }

  function showReconnect(res) {
    if (res.status === 409 && res.body && res.body.authorizeUrl === '/oauth2/authorization/google-picker') {
      $('connect').hidden = false;
      say(problemText(res));
      return true;
    }
    return false;
  }

  function loadMe() {
    return api('/api/admin/me').then(function (res) {
      $('signin').hidden = true; $('connect').hidden = true;
      $('importSection').hidden = true; $('gallerySection').hidden = true;
      if (res.status === 401) {
        $('who').textContent = 'Not signed in.';
        $('signin').hidden = false;
      } else if (res.status === 403) {
        $('who').textContent = 'Signed in, but this account is not the admin.';
      } else if (res.ok) {
        $('who').textContent = 'Signed in as ' + res.body.email + (res.body.pickerConnected ? ' - Google Photos connected.' : ' - Google Photos not connected.');
        $('connect').hidden = !!res.body.pickerConnected;
        $('importSection').hidden = false;
        $('gallerySection').hidden = false;
        loadGrid();
      } else {
        $('who').textContent = problemText(res);
      }
    });
  }

  function loadGrid() {
    return api('/api/admin/media?page=0&size=100').then(function (res) {
      var grid = $('grid');
      grid.textContent = '';
      if (!res.ok) { return; }
      res.body.items.forEach(function (item) {
        var tile = document.createElement('div');
        tile.className = 'tile';
        if (/^#[0-9a-fA-F]{6}$/.test(item.dominantColor || '')) { tile.style.background = item.dominantColor; }
        var img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = item.filename || 'photo';
        img.src = '/api/media/' + encodeURIComponent(item.id) + '/thumb';
        var del = document.createElement('button');
        del.type = 'button'; del.textContent = 'Delete';
        del.addEventListener('click', function () {
          if (!confirm('Delete this photo from Our Story? (Google Photos is not touched.)')) { return; }
          api('/api/admin/media/' + encodeURIComponent(item.id), 'DELETE').then(function (res) {
            if (!res.ok) { say(problemText(res)); }
            return loadGrid();
          });
        });
        tile.appendChild(img); tile.appendChild(del);
        grid.appendChild(tile);
      });
    });
  }

  function renderJob(job) {
    var handled = job.done + job.failed + job.skipped;
    var bar = $('bar');
    bar.hidden = false;
    bar.max = Math.max(job.total, 1);
    bar.value = handled;
    $('counts').textContent = 'Status ' + job.status + ': ' + handled + '/' + job.total +
      ' (imported ' + job.done + ', failed ' + job.failed + ', skipped ' + job.skipped + ')' +
      (job.error ? ' - ' + job.error : '');
    // A job that died because Google access was lost: offer the reconnect link again.
    if (job.status === 'FAILED' && /reconnect google photos/i.test(job.error || '')) {
      $('connect').hidden = false;
    }
    var list = $('failures');
    list.textContent = '';
    (job.failures || []).forEach(function (f) {
      var li = document.createElement('li');
      li.textContent = (f.filename || '(unnamed)') + ': ' + f.outcome + ' - ' + f.reason;
      list.appendChild(li);
    });
  }

  function trackJob(jobId) {
    return api('/api/admin/imports/' + encodeURIComponent(jobId)).then(function (res) {
      if (!res.ok) { say(problemText(res)); return; }
      renderJob(res.body);
      if (res.body.status === 'RUNNING') { return sleep(1000).then(function () { return trackJob(jobId); }); }
      say('Import finished.');
      return loadGrid();
    });
  }

  function waitForPicking(sessionId, pollMs, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 600000);
    function tick() {
      if (Date.now() > deadline) { say('Timed out waiting for the selection. Start again.'); return Promise.resolve(false); }
      return api('/api/admin/picker/sessions/' + encodeURIComponent(sessionId)).then(function (res) {
        if (!res.ok) { if (!showReconnect(res)) { say(problemText(res)); } return false; }
        if (res.body.mediaItemsSet) { return true; }
        var cfg = res.body.pollingConfig;
        var next = Math.max(cfg && cfg.pollIntervalMs ? cfg.pollIntervalMs : pollMs, 1000);
        return sleep(next).then(tick);
      });
    }
    return tick();
  }

  function startImport() {
    if (busy) { return; }
    busy = true; $('start').disabled = true;
    $('failures').textContent = ''; $('counts').textContent = ''; $('bar').hidden = true;
    say('Creating a Google Photos picker session...');
    api('/api/admin/picker/sessions', 'POST', {}).then(function (res) {
      if (!res.ok) { if (!showReconnect(res)) { say(problemText(res)); } return; }
      var uri = res.body.pickerUri;
      if (typeof uri !== 'string' || uri.indexOf('https://') !== 0) { say('Unexpected picker address.'); return; }
      $('pickerLink').href = uri;
      $('pickerBox').hidden = false;
      say('Waiting for you to finish picking photos...');
      var cfg = res.body.pollingConfig || {};
      return waitForPicking(res.body.sessionId, cfg.pollIntervalMs || 5000, cfg.timeoutMs).then(function (picked) {
        if (!picked) { return; }
        $('pickerBox').hidden = true;
        say('Importing...');
        return api('/api/admin/picker/sessions/' + encodeURIComponent(res.body.sessionId) + '/import', 'POST', {})
          .then(function (job) {
            if (!job.ok) { if (!showReconnect(job)) { say(problemText(job)); } return; }
            return trackJob(job.body.jobId);
          });
      });
    }).catch(function () { say('Network error.'); }).then(function () {
      busy = false; $('start').disabled = false;
    });
  }

  $('start').addEventListener('click', startImport);
  loadMe();
})();
