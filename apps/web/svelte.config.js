import adapter from '@sveltejs/adapter-node';

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
