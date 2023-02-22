module.exports = {
  root: true,

  env: {
    es2021: true
  },

  extends: [
    'plugin:vue/vue3-recommended',
    'eslint:recommended',
    '@vue/prettier'
  ],

  parserOptions: {
    ecmaVersion: 2020
  },

  rules: {
    'no-console':
      import.meta.env.NODE_ENV === 'production'
        ? 'warn'
        : 'off',
    'no-debugger':
      import.meta.env.NODE_ENV === 'production'
        ? 'warn'
        : 'off',
    'vue/no-v-html': 'off'
  }
}
