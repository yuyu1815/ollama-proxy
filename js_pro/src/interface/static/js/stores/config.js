/**
 * Config Store
 */

import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { api } from '../api.js';

const config = ref({
  host: '127.0.0.1',
  port: 11434,
  log_level: 'info',
});

export function useConfig() {
  const fetchConfig = async () => {
    const data = await api.get('/admin/api/config');
    config.value = data;
  };

  const saveConfig = async (newConfig) => {
    await api.post('/admin/api/config', newConfig);
    config.value = { ...newConfig };
  };

  return {
    config,
    fetchConfig,
    saveConfig,
  };
}
