const path = require('path');
const webpack = require('webpack');
const dotenv = require('dotenv');

module.exports = {
  entry: {
    'app': './static/js/App.tsx',
    'WalletProvider': './static/js/WalletProvider.tsx',
    'cnft-handler': './static/js/cnft-handler.js',
    'safe-transfer-cnft': './static/js/safe-transfer-cnft.js',
    'fixed-cnft-handler': './static/js/fixed-cnft-handler.js',
    'bubblegum-transfer': './static/js/bubblegum-transfer.js',
    'metaplex-cnft-transfer': './static/js/metaplex-cnft-transfer.js',
    'fixed-bubblegum-transfer': './static/js/fixed-bubblegum-transfer.js',
    'self-contained-transfer': './static/js/self-contained-transfer.js',
    'self-contained-patch': './static/js/self-contained-patch.js',
    'cnft-direct-patch': './static/js/cnft-direct-patch.js',
    'basic-transfer': './static/js/basic-transfer.js',
    'hidden-assets': './static/js/hidden-assets.js',
    'animations': './static/js/animations.js'
  },
  output: {
    path: path.resolve(__dirname, 'static/dist'),
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'window',
    publicPath: '/static/dist/'  // Update to match server static path
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react',
                '@babel/preset-typescript'
              ]
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'static/js')
    },
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "crypto": require.resolve("crypto-browserify"),
      "http": require.resolve("stream-http"),
      "https": require.resolve("https-browserify"),
      "url": require.resolve("url/"),
      "zlib": require.resolve("browserify-zlib"),
      "buffer": require.resolve("buffer/"),
      "process": require.resolve("process/browser"),
      "vm": require.resolve("vm-browserify")
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: require.resolve("process/browser"),
      Buffer: ['buffer', 'Buffer'],
      React: 'react'
    }),
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('development')
        // No longer pass environment variables directly
        // We'll use the API endpoint instead
      }
    })
  ],
  mode: 'development',
  devtool: 'source-map'
};