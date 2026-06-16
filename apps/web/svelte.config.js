import adapter from '@sveltejs/adapter-auto';

const config = {
  compilerOptions: {
    compatibility: {
      componentApi: 4
    }
  },
  kit: {
    adapter: adapter()
  }
};

export default config;
