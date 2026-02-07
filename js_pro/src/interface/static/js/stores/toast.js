/**
 * Toast Store
 */

import { ref } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';

const toast = ref(null);
let toastTimeout = null;

export function useToast() {
  const show = (message, type = 'success', duration = 3000) => {
    if (toastTimeout) clearTimeout(toastTimeout);

    toast.value = { message, type };

    toastTimeout = setTimeout(() => {
      toast.value = null;
    }, duration);
  };

  const success = (message) => show(message, 'success');
  const error = (message) => show(message, 'error');
  const info = (message) => show(message, 'info');

  return {
    toast,
    show,
    success,
    error,
    info,
  };
}
