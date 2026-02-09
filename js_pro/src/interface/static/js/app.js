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

    const currentTab = ref('configuration');
    const reloading = ref(false);

    // Sub-navigation state for Configuration tab
    const configSubTab = ref('providers'); // 'providers' | 'models'
    const showAddProvider = ref(false);
    const showAddModel = ref(false);

    const isEditingProvider = ref(false);
    const isEditingModel = ref(false);
    const originalProviderId = ref(null);
    const originalModelName = ref(null);

    // Simplified state: fixed list of AI SDK providers
    const availableProviders = [
      'openai',
      'anthropic',
      'google',
      'mistral',
      'cohere',
      'deepseek',
      'groq',
      'togetherai',
      'fireworks',
      'xai',
    ];

    const selectedProviderType = ref('openai');
    const selectedModelProvider = ref('openai');

    const modelForm = ref({
      name: '',
      provider: '',
      model_name: '',
      rate_limit: { requests: null, concurrent: null }
    });
    const providerForm = ref({
      id: '',
      provider: 'openai',
      api_key: '',
      base_url: '',
      max_retries: 5,
      rate_limit: { requests: null, concurrent: null }
    });
    const inlineProviderForm = ref({
      api_key: '',
      base_url: '',
      max_retries: 5,
      rate_limit: { requests: null, concurrent: null }
    });
    const editingModelForm = ref({
      name: '',
      model_name: '',
      rate_limit: { requests: null, concurrent: null }
    });

    const stats = ref({
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      recent: [],
      daily: {},
      models: {},
      providers: {},
    });

    const tabs = [
      { id: 'configuration', label: 'Configuration', icon: 'ph ph-faders' },
      // Dashboard disabled for now
      // { id: 'dashboard', label: 'Dashboard', icon: 'ph ph-chart-line-up' },
    ];

    const toastIcon = computed(() => {
      if (!toastStore.toast.value) return '';
      return toastStore.toast.value.type === 'error'
        ? 'ph ph-warning-circle'
        : 'ph ph-check-circle';
    });

    const setProviderType = (p) => {
      selectedProviderType.value = p;
      isEditingProvider.value = false;
      originalProviderId.value = null;
      // Reset form when switching types
      providerForm.value = {
        id: p === 'custom_openai' ? '' : p,
        provider: p,
        api_key: '',
        base_url: '',
        max_retries: 5,
        rate_limit: { requests: null, concurrent: null }
      };
    };

    const setModelProvider = (p) => {
      selectedModelProvider.value = p;
    };

    const groupedModels = computed(() => {
      if (!modelsStore.models.value) return {};

      const groups = {};
      modelsStore.models.value.forEach((model) => {
        const providerId = model.provider;
        let providerType = model.provider_type;

        // Try to find provider type from providers store if not present on model
        if (!providerType) {
          const provider = providersStore.providers.value.find(p => p.id === providerId);
          providerType = provider ? provider.provider : 'unknown';
        }

        if (!groups[providerType]) {
          groups[providerType] = {};
        }
        if (!groups[providerType][providerId]) {
          groups[providerType][providerId] = [];
        }
        groups[providerType][providerId].push(model);
      });

      // Sort provider types alphabetically
      const sortedGroups = {};
      Object.keys(groups).sort().forEach(providerType => {
        // Sort provider IDs alphabetically within each type
        sortedGroups[providerType] = {};
        Object.keys(groups[providerType]).sort().forEach(providerId => {
          // Sort models within provider by name
          sortedGroups[providerType][providerId] = groups[providerType][providerId].sort((a, b) =>
            a.name.localeCompare(b.name)
          );
        });
      });

      return sortedGroups;
    });

    // deleteModel moved to group with edit logic

    const toggleAddProvider = () => {
      if (showAddProvider.value && isEditingProvider.value) {
        // If already showing and editing, just reset
        isEditingProvider.value = false;
        originalProviderId.value = null;
        setProviderType(selectedProviderType.value);
      } else {
        showAddProvider.value = !showAddProvider.value;
        if (!showAddProvider.value) {
          isEditingProvider.value = false;
          originalProviderId.value = null;
          setProviderType(selectedProviderType.value);
        }
      }
    };

    const toggleAddModel = () => {
      if (showAddModel.value && isEditingModel.value) {
        isEditingModel.value = false;
        originalModelName.value = null;
        modelForm.value = { name: '', provider: '', model_name: '', rate_limit: { requests: null, concurrent: null } };
      } else {
        showAddModel.value = !showAddModel.value;
        if (!showAddModel.value) {
          isEditingModel.value = false;
          originalModelName.value = null;
          modelForm.value = { name: '', provider: '', model_name: '', rate_limit: { requests: null, concurrent: null } };
        }
      }
    };

    const createModel = async () => {
      try {
        if (!modelForm.value.provider) {
          throw new Error('プロバイダーを選択してください');
        }
        if (isEditingModel.value) {
          await modelsStore.updateModel(originalModelName.value, modelForm.value);
          toastStore.success('モデルを更新しました');
        } else {
          await modelsStore.createModel(modelForm.value);
          toastStore.success('モデルを追加しました');
        }
        modelForm.value = { name: '', provider: '', model_name: '', rate_limit: { requests: null, concurrent: null } };
        showAddModel.value = false;
        isEditingModel.value = false;
        originalModelName.value = null;
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const createProvider = async () => {
      try {
        if (isEditingProvider.value) {
          await providersStore.updateProvider(originalProviderId.value, providerForm.value);
          toastStore.success('プロバイダーを更新しました');
        } else {
          await providersStore.createProvider(providerForm.value);
          toastStore.success('プロバイダーを追加しました');
        }
        setProviderType(selectedProviderType.value);
        showAddProvider.value = false;
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const editProvider = (provider) => {
      isEditingProvider.value = true;
      originalProviderId.value = provider.id;
      selectedProviderType.value = provider.provider;
      providerForm.value = {
        ...provider,
        rate_limit: {
          requests: provider.rate_limit?.requests || null,
          concurrent: provider.rate_limit?.concurrent || null
        }
      };
      showAddProvider.value = true;
      // Scroll to top of form
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const editModel = (model) => {
      isEditingModel.value = true;
      originalModelName.value = model.name;
      modelForm.value = {
        ...model,
        rate_limit: {
          requests: model.rate_limit?.requests || null,
          concurrent: model.rate_limit?.concurrent || null
        }
      };
      showAddModel.value = true;
      // Scroll to form (models section is further down)
      const el = document.querySelector('.models-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };

    const deleteProvider = async (id) => {
      if (!confirm(`プロバイダー "${id}" を削除しますか？`)) return;
      try {
        await providersStore.deleteProvider(id);
        toastStore.success('プロバイダーを削除しました');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const deleteModel = async (name) => {
      if (!confirm(`モデル "${name}" を削除しますか？`)) return;
      try {
        await modelsStore.deleteModel(name);
        toastStore.success('モデルを削除しました');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const saveSettings = async () => {
      try {
        await configStore.saveConfig(configStore.config.value);
        toastStore.success('設定を保存しました');
      } catch (err) {
        toastStore.error(err.message);
      }
    };

    const fetchStats = async () => {
      try {
        const data = await api.get('/admin/api/stats');
        stats.value.daily = data.daily;
        stats.value.models = data.models;
        stats.value.providers = data.providers;
        stats.value.recent = data.recent;

        // Calculate totals
        let totalRequests = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        Object.values(data.models).forEach((m) => {
          totalRequests += m.count;
          totalInputTokens += m.total_input_tokens;
          totalOutputTokens += m.total_output_tokens;
        });

        stats.value.totalRequests = totalRequests;
        stats.value.totalInputTokens = totalInputTokens;
        stats.value.totalOutputTokens = totalOutputTokens;
        stats.value.totalTokens = totalInputTokens + totalOutputTokens;

        renderCharts();
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      }
    };

    let dailyChart = null;
    let providerChart = null;
    let modelChart = null;

    // Helper
    const truncateApiKey = (key) => {
      if (!key || key.length < 8) return key || '';
      return '••••' + key.substring(key.length - 4);
    };

    const formatRateLimit = (rateLimit) => {
      const requests = rateLimit?.requests || '∞';
      const concurrent = rateLimit?.concurrent || '∞';
      return { requests, concurrent };
    };

    const renderCharts = () => {
      // Daily Usage Chart
      const dailyCtx = document.getElementById('dailyChart');
      if (dailyCtx) {
        if (dailyChart) dailyChart.destroy();
        const labels = Object.keys(stats.value.daily).sort();
        dailyChart = new Chart(dailyCtx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: '入力トークン',
                data: labels.map(
                  (d) => stats.value.daily[d].total_input_tokens
                ),
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
              },
              {
                label: '出力トークン',
                data: labels.map(
                  (d) => stats.value.daily[d].total_output_tokens
                ),
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
              },
            ],
          },
          options: {
            responsive: true,
            scales: {
              x: { stacked: true },
              y: { stacked: true },
            },
          },
        });
      }

      // Provider Distribution Chart
      const providerCtx = document.getElementById('providerChart');
      if (providerCtx) {
        if (providerChart) providerChart.destroy();
        const labels = Object.keys(stats.value.providers);
        providerChart = new Chart(providerCtx, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [
              {
                data: labels.map(
                  (p) =>
                    stats.value.providers[p].total_input_tokens +
                    stats.value.providers[p].total_output_tokens
                ),
                backgroundColor: [
                  '#FF6384',
                  '#36A2EB',
                  '#FFCE56',
                  '#4BC0C0',
                  '#9966FF',
                  '#FF9F40',
                ],
              },
            ],
          },
        });
      }

      // Model Distribution Chart
      const modelCtx = document.getElementById('modelChart');
      if (modelCtx) {
        if (modelChart) modelChart.destroy();
        const labels = Object.keys(stats.value.models);
        modelChart = new Chart(modelCtx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: '合計トークン',
                data: labels.map(
                  (m) =>
                    stats.value.models[m].total_input_tokens +
                    stats.value.models[m].total_output_tokens
                ),
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
          },
        });
      }
    };

    const formatNumber = (num) => {
      return new Intl.NumberFormat().format(num);
    };

    const formatDate = (isoString) => {
      return new Date(isoString).toLocaleString();
    };

    const reloadConfig = async () => {
      reloading.value = true;
      try {
        await api.post('/admin/api/reload');
        await Promise.all([
          modelsStore.fetchModels(),
          providersStore.fetchProviders(),
          configStore.fetchConfig(),
          fetchStats(),
        ]);
        toastStore.success('設定を再読み込みしました');
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
        fetchStats(),
      ]).catch((err) => {
        toastStore.error('データの読み込みに失敗しました');
        console.error(err);
      });
    });

    return {
      currentTab,
      configSubTab,
      showAddProvider,
      showAddModel,
      reloading,
      isEditingProvider,
      isEditingModel,
      originalProviderId,
      originalModelName,
      modelForm,
      providerForm,
      tabs,
      toggleAddProvider,
      toggleAddModel,
      editModel,
      deleteModel,
      availableProviders,
      groupedModels,
      providers: providersStore.providers,
      config: configStore.config,
      toast: toastStore.toast,
      toastIcon,
      stats,
      createModel,
      createProvider,
      editProvider,
      deleteProvider,
      saveSettings,
      reloadConfig,
      formatNumber,
      formatDate,
      // Exports
      selectedProviderType,
      selectedModelProvider,
      truncateApiKey,
      formatRateLimit,
      setProviderType,
      setModelProvider,
    };
  },
};

createApp(App).mount('#app');
