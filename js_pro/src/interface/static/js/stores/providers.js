/**
 * Providers Store
 */

import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { api } from '../api.js';

const providers = ref([]);

export function useProviders() {
  const fetchProviders = async () => {
    const data = await api.get('/admin/api/providers');
    providers.value = data;
  };

  const createProvider = async (provider) => {
    await api.post('/admin/api/providers', provider);
    await fetchProviders();
  };

  const updateProvider = async (id, provider) => {
    await api.put(`/admin/api/providers/${id}`, provider);
    await fetchProviders();
  };

  const deleteProvider = async (id) => {
    await api.delete(`/admin/api/providers/${id}`);
    await fetchProviders();
  };

  return {
    providers,
    fetchProviders,
    createProvider,
    updateProvider,
    deleteProvider,
  };
}
