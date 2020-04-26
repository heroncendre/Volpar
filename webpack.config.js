const path = require('path')
const copy = require('copy-webpack-plugin');

module.exports = {
	mode: 'development',
	entry: './assets/js/app.js',
	devtool: 'source-map',
	watch: true,
	output: {
		path: path.resolve('./dist'),
		filename: 'bundle.js'
	},
	module: {
		rules: [
			{
			    test: /\.m?js$/,
		        exclude: /(node_modules|bower_components)/,
				use: ['babel-loader'],
			}
		]
	},
	plugins:[
		new copy([
			{
		    	from: './assets/html/index.html'
		    }
	    ])
    ]
}
