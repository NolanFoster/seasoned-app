module.exports = function() {
  return {
    visitor: {
      MemberExpression(path) {
        const node = path.node;
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.name === 'env'
        ) {
          path.replaceWith({
            type: 'MemberExpression',
            object: { type: 'Identifier', name: 'process' },
            property: { type: 'Identifier', name: 'env' }
          });
        }
        // import.meta.url → a placeholder string so Jest can parse files that
        // use `new Worker(new URL('./gestureWorker.js', import.meta.url))`.
        // The Worker constructor is never invoked in tests (gestureSupportEnabled
        // bootstraps to false), so this stub value is never evaluated at runtime.
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.name === 'url'
        ) {
          path.replaceWith({
            type: 'StringLiteral',
            value: 'file://__mocked_import_meta_url__'
          });
        }
      }
    }
  };
};
