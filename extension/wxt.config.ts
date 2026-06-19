import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'YouTube Subtitle Translator AI',
    description: 'Dịch và hiển thị phụ đề trực tiếp trên video YouTube bằng backend local.',
    version: '1.2.1',
    permissions: ['storage', 'tabs'],
    host_permissions: ['http://127.0.0.1:8765/*'],
    action: {
      default_title: 'YouTube Subtitle Translator AI',
    },
  },
});
