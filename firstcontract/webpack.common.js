 const dotenv = require("dotenv");
 dotenv.config();
 
 const path = require("path");
 const HtmlWebpackPlugin = require("html-webpack-plugin");
 const webpack = require("webpack");
 
 module.exports = {
     entry: "./src/index.ts", // bundle"s entry point
     output: {
         path: path.resolve(__dirname, "dist"), // output directory
         filename: "[name].js", // name of the generated bundle
     },
     resolve: {
         extensions: [".js", ".ts", ".json"],
     },
 
     plugins: [
         new HtmlWebpackPlugin({
             template: "./src/index.html",
             inject: "body",
         }),
         
     ],

     module: {
         rules: [
             {
                 test: /\.ts$/,
                 loader: "ts-loader",
                 exclude: /node_modules/,
             },
 
             {
                 test: /\.css$/i,
                 use: ["style-loader", "css-loader"],
             },
         ],
     },
 }; 