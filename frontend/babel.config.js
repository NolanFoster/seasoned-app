module.exports = {
  presets: [
    ['@babel/preset-env', {
      targets: {
        node: 'current'
      },
      modules: 'commonjs'
    }],
    ['@babel/preset-react', { runtime: 'automatic' }]
  ],
  plugins: [
    './babel-plugin-transform-import-meta.js'
  ]
};
