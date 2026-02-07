/**
 * Models Store
 */

import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { api } from '../api.js';

const models = ref([]);

export function useModels() {
  const fetchModels = async () => {
    const data = await api.get('/admin/api/models');
    models.value = data;
  };

  const createModel = async (model) => {
    await api.post('/admin/api/models', model);
    await fetchModels();
  };

  const updateModel = async (name, model) => {
    await api.put(`/admin/api/models/${name}`, model);
    await fetchModels();
  };

  const deleteModel = async (name) => {
    await api.delete(`/admin/api/models/${name}`);
    await fetchModels();
  };

  return {
    models,
    fetchModels,
    createModel,
    updateModel,
    deleteModel,
  };
}
