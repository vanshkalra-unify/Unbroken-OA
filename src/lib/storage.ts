import localforage from "localforage";

// Configure localForage instance for the OA App
localforage.config({
  name: 'OnlineAssessmentApp',
  storeName: 'oa_state'
});

export const LocalStorage = {
  async setItem(key: string, value: any) {
    try {
      await localforage.setItem(key, value);
    } catch (err) {
      console.error("LocalForage Set Error:", err);
    }
  },
  
  async getItem(key: string) {
    try {
      return await localforage.getItem(key);
    } catch (err) {
      console.error("LocalForage Get Error:", err);
      return null;
    }
  },
  
  async removeItem(key: string) {
    try {
      await localforage.removeItem(key);
    } catch (err) {
      console.error("LocalForage Remove Error:", err);
    }
  },

  async clear() {
    try {
      await localforage.clear();
    } catch (err) {
      console.error("LocalForage Clear Error:", err);
    }
  }
};
