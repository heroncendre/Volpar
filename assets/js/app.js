import Volpar from './volpar'

class App {
	constructor(canvas, params) {
		console.log("Build new App")
		this.volpar = new Volpar(canvas)
	}

	run() {
		this.volpar.start()
	}
}

let canvas = document.getElementById("canvas")
let params = {canvas}
let app = new App(params)
app.run()
