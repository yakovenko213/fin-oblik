(() => {
  const config = window.FIREBASE_CONFIG;
  const usable = config && config.projectId === 'fin-oblik' && config.apiKey && config.databaseURL;
  let store = null;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });

  const setStatus = (status, text) => {
    const el = document.getElementById('cloudStatus');
    if (!el) return;
    el.className = `cloud-status ${status}`;
    const txt = el.querySelector('.cloud-text');
    if (txt) txt.textContent = text;
  };

  window.financeStore = {
    enabled: false,
    ready,
    save: state => store ? store.save(state) : Promise.resolve(),
    setStatus
  };

  if (!usable) {
    console.info('Firebase не налаштовано: застосунок використовує локальне збереження.');
    setStatus('local', 'Локальний режим');
    resolveReady(null);
    return;
  }

  (async () => {
    try {
      setStatus('connecting', 'Підключення...');
      const [{ initializeApp }, { getDatabase, ref, get, set, onValue, serverTimestamp }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js')
      ]);

      const app = initializeApp(config);
      const db = getDatabase(app);
      const stateRef = ref(db, 'accounting/fin-oblik-state');

      let queued = Promise.resolve();
      let saveTimer = null;
      const localWriteFingerprints = new Set();
      const stableStringify = value => {
        const normalize = item => {
          if (Array.isArray(item)) return item.map(normalize);
          if (item && typeof item === 'object') return Object.keys(item).sort().reduce((result, key) => {
            if (key === 'updatedAt') return result;
            const normalized = normalize(item[key]);
            const emptyArray = Array.isArray(normalized) && normalized.length === 0;
            const emptyObject = normalized && !Array.isArray(normalized) && typeof normalized === 'object' && Object.keys(normalized).length === 0;
            if (normalized !== null && normalized !== undefined && !emptyArray && !emptyObject) result[key] = normalized;
            return result;
          }, {});
          return item;
        };
        return JSON.stringify(normalize(value));
      };

      store = {
        save(state) {
          // Видаляємо undefined значення через JSON серіалізацію, оскільки Firebase RTDB не підтримує undefined
          const cleanState = JSON.parse(JSON.stringify(state));
          setStatus('saving', 'Збереження...');

          const write = queued.then(async () => {
            const fingerprint = stableStringify(cleanState);
            localWriteFingerprints.add(fingerprint);
            setTimeout(() => localWriteFingerprints.delete(fingerprint), 30000);
            await set(stateRef, {
              ...cleanState,
              updatedAt: serverTimestamp()
            });
            setStatus('connected', 'Хмара: збережено');
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
              setStatus('connected', 'Хмара підключена');
            }, 2500);
          });

          // Помилка однієї операції не повинна блокувати всі наступні спроби збереження.
          queued = write.catch(err => {
            console.error('Помилка збереження у Firebase Realtime Database:', err);
            setStatus('error', 'Помилка збереження');
          });

          return write;
        }
      };

      window.financeStore.enabled = true;

      // Отримання початкових даних з бази
      const snapshot = await get(stateRef);
      const cloudData = snapshot.exists() ? snapshot.val() : null;
      setStatus('connected', 'Хмара підключена');
      resolveReady(cloudData);

      // Синхронізація оновлень у реальному часі (з інших вкладок/пристроїв)
      let initialLoad = true;
      onValue(stateRef, snap => {
        if (initialLoad) {
          initialLoad = false;
          return;
        }
        if (!snap.exists()) return;
        const data = snap.val();
        const fingerprint = stableStringify(data);
        if (localWriteFingerprints.has(fingerprint)) {
          return;
        }
        if (typeof window.onCloudStateChange === 'function') {
          window.onCloudStateChange(data);
        }
      });
    } catch (error) {
      console.error('Не вдалося підключитися до Firebase Realtime Database:', error);
      setStatus('error', 'Помилка бази');
      resolveReady(null);
    }
  })();
})();
