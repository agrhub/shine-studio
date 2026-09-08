import { defineStore } from 'pinia';
import { ref } from 'vue';
import http from '@/utils/http';
import { Asset } from '@/types/api';
export type { Asset } from '@/types/api';

export const useAssetsStore = defineStore('assets', () => {
  const assets = ref<Asset[]>([]);
  const isLoading = ref<boolean>(false);
  const isUploading = ref<boolean>(false);

  let activeFetchPromise: Promise<Asset[]> | null = null;

  async function fetchAssets(params?: { type?: string; search?: string; userId?: string }) {
    if (activeFetchPromise) return activeFetchPromise;
    isLoading.value = true;
    activeFetchPromise = (async () => {
      try {
        const res: any = await http.get('/assets', { params });
        const list = res?.data?.assets || res?.assets || res?.data || res;
        assets.value = Array.isArray(list) ? list : [];
        return assets.value;
      } catch (err) {
        console.error('Failed to fetch assets from API', err);
        return assets.value;
      } finally {
        isLoading.value = false;
        activeFetchPromise = null;
      }
    })();
    return activeFetchPromise;
  }

  async function createAsset(payload: Partial<Asset>) {
    isUploading.value = true;
    try {
      const res: any = await http.post('/assets', payload);
      const created = res?.data || res;
      if (created && created.id) {
        assets.value.unshift(created);
        return created;
      }
      return null;
    } catch (err) {
      console.error('Failed to create asset via API', err);
      throw err;
    } finally {
      isUploading.value = false;
    }
  }

  async function deleteAsset(id: string) {
    try {
      await http.delete(`/assets/${id}`);
      assets.value = assets.value.filter(a => a.id !== id);
      return true;
    } catch (err) {
      console.error('Failed to delete asset via API', err);
      throw err;
    }
  }

  return {
    assets,
    isLoading,
    isUploading,
    fetchAssets,
    createAsset,
    deleteAsset,
  };
});
