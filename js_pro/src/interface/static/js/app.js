/**
 * Main Application
 */

import {
  computed,
  createApp,
  onMounted,
  ref,
} from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { useModels } from './stores/models.js';
import { useProviders } from './stores/providers.js';
import { useConfig } from './stores/config.js';
import { useToast } from './stores/toast.js';
import { api } from './api.js';

const App = {
  setup() {
    const modelsStore = useModels();
    const providersStore = useProviders();
    const configStore = useConfig();
    const toastStore = useToast();

    const currentTab = ref('models');
    const reloading = ref(false);

    const isModelModalOpen = ref(false);
    const isProviderModalOpen = ref(false);
    const editingModel = ref(null);
    const editingProvider = ref(null);

    const modelForm = ref({ name: '', provider: 'openai', model_name: '' });
    const providerForm = ref({
      id: '',
      provider: 'openai',
      api_key: '',
      base_url: '',
    });

    const tabs = [
      { id: 'models', label: 'Models', icon: 'ph ph-robot' },
      { id: 'providers', label: 'Providers', icon: 'ph ph-plug' },
      { id: 'settings', label: 'Settings', icon: 'ph ph-gear' },
    ];

    const availableProviders = [
      'openai',
      'anthropic',
      'google',
      'xai',
      'azure',
      'mistral',
      'cohere',
      'deepseek',
      'togetherai',
      'groq',
      'fireworks',
      'bedrock',
    ];

    const toastIcon = computed(() => {
      if (!toastStore.toast.value) return '';
      return toastStore.toast.value.type === 'error'
        ? 'ph ph-warning-circle'
        : 'ph ph-check-circle';
    });

    const openAddModel = () => {
      editingModel.value = null;
      modelForm.value = { name: '', provider: 'openai', model_name: '' };
      isModelModalOpen.value = true;
    };

    const editModel = (model) => {
      editingModel.value = model;
      modelForm.value = { ...model };
      isModelModalOpen.value = true;
    };

    const closeModelModal = () => {
      isModelModalOpen.value = false;
      editingModel.value = null;
      modelForm.value = { name: '', provider: 'openai', model_name: '' };
    };

    const saveModel = async () => {
      try {
        if (editingModel.value) {
          await modelsStore.updateModel(
            editingModel.value.name,
            modelForm.value
          );
        } else {
          await modelsStore.createModel(modelForm.value);
        }
        closeModelModal();
        toastStore.success('Model saved successfully');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const deleteModel = async (name) => {
      if (!confirm(`Delete model "${name}"?`)) return;
      try {
        await modelsStore.deleteModel(name);
        toastStore.success('Model deleted');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const openAddProvider = () => {
      editingProvider.value = null;
      providerForm.value = {
        id: '',
        provider: 'openai',
        api_key: '',
        base_url: '',
      };
      isProviderModalOpen.value = true;
    };

    const editProvider = (provider) => {
      editingProvider.value = provider;
      providerForm.value = { ...provider };
      isProviderModalOpen.value = true;
    };

    const closeProviderModal = () => {
      isProviderModalOpen.value = false;
      editingProvider.value = null;
      providerForm.value = {
        id: '',
        provider: 'openai',
        api_key: '',
        base_url: '',
      };
    };

    const saveProvider = async () => {
      try {
        if (editingProvider.value) {
          await providersStore.updateProvider(
            editingProvider.value.id,
            providerForm.value
          );
        } else {
          await providersStore.createProvider(providerForm.value);
        }
        closeProviderModal();
        toastStore.success('Provider saved successfully');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const deleteProvider = async (id) => {
      if (!confirm(`Delete provider "${id}"?`)) return;
      try {
        await providersStore.deleteProvider(id);
        toastStore.success('Provider deleted');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const saveSettings = async () => {
      try {
        await configStore.saveConfig(configStore.config.value);
        toastStore.success('Settings saved');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const reloadConfig = async () => {
      reloading.value = true;
      try {
        await api.post('/admin/api/reload');
        await Promise.all([
          modelsStore.fetchModels(),
          providersStore.fetchProviders(),
          configStore.fetchConfig(),
        ]);
        toastStore.success('Configuration reloaded');
      } catch (err) {
        toastStore.error(err.message);
      } finally {
        reloading.value = false;
      }
    };

    onMounted(() => {
      Promise.all([
        modelsStore.fetchModels(),
        providersStore.fetchProviders(),
        configStore.fetchConfig(),
      ]).catch((err) => {
        toastStore.error('Failed to load initial data');
        console.error(err);
      });
    });

    return {
      currentTab,
      reloading,
      isModelModalOpen,
      isProviderModalOpen,
      editingModel,
      editingProvider,
      modelForm,
      providerForm,
      tabs,
      availableProviders,
      models: modelsStore.models,
      providers: providersStore.providers,
      config: configStore.config,
      toast: toastStore.toast,
      toastIcon,
      openAddModel,
      editModel,
      closeModelModal,
      saveModel,
      deleteModel,
      openAddProvider,
      editProvider,
      closeProviderModal,
      saveProvider,
      deleteProvider,
      saveSettings,
      reloadConfig,
    };
  },
};

createApp(App).mount('#app');
