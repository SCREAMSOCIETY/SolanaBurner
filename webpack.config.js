const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: {
    'WalletProvider': './static/js/WalletProvider.tsx',
    'cnft-handler': './static/js/cnft-handler.js'
  },
  output: {
    path: path.resolve(__dirname, 'static/dist'),
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'window'
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: 'ts-loader',
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
      "process": require.resolve("process/browser")
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: require.resolve("process/browser"),
      Buffer: ['buffer', 'Buffer']
    }),
    new webpack.DefinePlugin({
      'process.env': {
        'NODE_ENV': JSON.stringify('development'),
        'QUICKNODE_RPC_URL': JSON.stringify(process.env.QUICKNODE_RPC_URL || '')
      }
    })
  ],
  externals: {
    'react': 'React',
    'react-dom': 'ReactDOM'
  },
  mode: 'development',
  devtool: 'source-map'
};