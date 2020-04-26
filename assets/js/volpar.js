import * as Utils from "./utils"

/*
 * THREE.js
 * WebGL based 3D graphics library
 * https://threejs.org/
 */
import * as THREE from "three"
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls.js"
import {FBXLoader} from "three/examples/jsm/loaders/FBXLoader"

/*
 * RBush 
 * Spatial Hashmap
 * https://github.com/mourner/rbush
 */
import RBush from "rbush"


/*
 * Volpar
 * Volumetric particles
 * Inject particles into a volume defined by a 3D mesh
 *
 * Insertion is done by adding random particles in the bounding box of the mesh
 * and then afterwards checking whether it is inside or outside the mesh
 */

export default class Volpar {

	/*
	 * Volpar
	 * Volumetric Particles
	 * Constructor
	 */
	constructor(params = {}) {
		this.canvas = params.canvas

		// Settings
		this.debug = false
		this.autorotation = false

		// Animation
		this.elapsedTime = 0
		this.lastTime = 0
		this.raf = null

		// Particles and filling settings
		this.nParticles = typeof params.particles === "number" ? params.particles : 50000
		this.particlesCount = 0
		this.particles = []
		this.particleSize = 1.2
		this.particleColor = "#e02020"
		
		this.fillChunckSize = 10000 // should be changed depending on the BBox efficiency
		this.fillChunckAutoSize = true

		// Rendering
		this.renderer = null
		this.scene = null
		this.camera = null
		this.mesh = null
		this.meshOpacity = 0.1

		// Performance benchmarks
		this.perfFill = 0
		this.perfRaycast = 0
		this.perfProjParticle = 0
		this.perfSetupHSM = 0
		this.perfSearchHSM = 0
	}

	/*
	 * Destroy routine
	 * Cleanup everything and release memory
	 */
	destroy()
	{
		Utils.disposeScene(this.scene)
		this.scene = null

		this.camera = null
		this.renderer = null
		this.mesh = null
	}

	/*
	 * Setup rendering objects
	 * Renderer, scene, camera and controller
	 * Add some fog
	 * Debug purpose: axis helper to display the world coordinates
	 */
	setupRendering()
	{
		this.renderer = new THREE.WebGLRenderer({canvas: this.canvas, antialias: true})
		this.renderer.setPixelRatio(window.devicePixelRatio)
		this.renderer.autoClear = true

		this.scene = new THREE.Scene()
		this.scene.fog = new THREE.Fog("#402020", 10, 60)

		// Create some orthographic camera just fitting with the mesh size
		// This will ease debug when drawing orthogrpahic projection rays
		this.camera = new THREE.OrthographicCamera(-33, 33, 21, -21, 1, 1000)
		this.camera.position.set(25, 0, 25)
		this.camera.lookAt(new THREE.Vector3(0, 0, 0))
		this.controls = new OrbitControls(this.camera, this.renderer.domElement)

		if (this.debug === true)
		{
			// Axis display (debug purpose)
			var axesHelper = new THREE.AxesHelper(50)
			this.scene.add(axesHelper)
		}
	}

	/*
	 * One frame of mesh filling
	 * 
	 * Number of particles is set in the class params
	 * In a first approx we will generate particles into the bounding box
	 * of the mesh. Then we will investigate to find if it's inside or 
	 * outside the mesh.
	 * 
	 * Particles are created by chuncks (size set in the context) to prevent
	 * from blocking the page
	 * 
	 * Use particle projection to find if it should be kept or discared as
	 * explained later
	 */
	fillMeshWithParticlesFrame()
	{
		// frame count
		let count = 0

		// Mesh geometry
		const geometry = this.mesh.geometry

		// Projection plane
		const plane = geometry.userData.shmProjectionPlane

		// Get fill settings
		const center = this.mesh.userData.shmMeshBBCenter
		const size = this.mesh.userData.shmMeshBBSize

		// Benchmark start for frame fill
		let tFrame0 = performance.now()

		while (this.particlesCount !== this.nParticles && count < this.fillChunckSize)
		{
			count++

			// Benchmark start for point generation and projection
			let tp0 = performance.now()

			// Generate a point inside the bounding box
			let x = center.x + size.x * Math.random() - size.x * 0.5
			let y = center.y + size.y * Math.random() - size.y * 0.5
			let z = center.z + size.z * Math.random() - size.z * 0.5				
	
			let pt = new THREE.Vector3(x,y,z)

			// Project the point on the plane
			let projPt = new THREE.Vector3()
			plane.projectPoint(pt, projPt)

			// Benchmark end for point generation and projection
			this.perfProjParticle += (performance.now() - tp0)

			// Search for triangles stored in the SHM cell where is the projected point
			// Benchmark start for SHM search
			let ts0 = performance.now()
			const objects = geometry.userData.shm.search({
			    minX: projPt.x,
			    minY: projPt.y,
			    maxX: projPt.x + 1,
			    maxY: projPt.y + 1
			})

			// Benchmark end for SHM search
			this.perfSearchHSM += (performance.now() - ts0)


			// If there is no object found, the point is outside the mesh, exlude it
			if (typeof objects === "undefined" || objects.length === 0)
			{
				// console.log("reject particle (no mesh)")
				continue
			}

			// Then we will project the point to the same plane using a raycaster
			// We will have a look at the mesh triangles that will be intersected
			// by the ray. If the number is even, the point is outside. If the number
			// is odd, the point is inside the mesh
			
			// Benchmark start for raycasting
			let tr0 = performance.now()

			// Build the ray from the point to the plane
			const origin = pt
			const direction = geometry.userData.shmProjectionDirection
			let raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1), 0.1, 1000)
			let meshs = objects.map(object => object.mesh)		
			let intersects = raycaster.intersectObjects(meshs, false)
			
			// Benchmark end for raycasting
			this.perfRaycast += (performance.now() - tr0)

			if (intersects.length % 2 === 0)
			{
				// console.log("reject particle (even count: " + intersects.length + ")")
				continue
			}

			// Draw the ray (debug purpose)
			this.drawRay(raycaster.ray, Math.abs(pt.z - projPt.z), 0x00ff00, 0.2)

			// Increment particles counter
			this.particlesCount++

			// Store the point coordinates into the particles list
			this.particles.push(pt.x, pt.y, pt.z)
		}

		// Benchmark end for frame fill
		let currentFrame = (performance.now() - tFrame0)
		this.perfFill += currentFrame
		let progress = Math.round(100 * this.particlesCount / this.nParticles)
		console.log("[PERF] Particle fill current frame : " + currentFrame.toFixed() + "ms (" + progress + "%)")  // in milliseconds

		// Frame size adaptation, should not be more than 1/60fps = 16ms but not too small
		if (this.fillChunckAutoSize)
		{
			if (currentFrame > 16 || currentFrame < 12)
			{
				let frameFactor = 16 / currentFrame
				this.fillChunckSize *= frameFactor			
			}			
		}

		// Finally draw particles on complete or schedule next call
		if (this.particlesCount === this.nParticles)
		{
			// Improvement: replace this direct call with some event dispatching
			this.onFillParticlesComplete()
		}
		else
		{
			window.requestAnimationFrame(this.fillMeshWithParticlesFrame.bind(this))
		}
	}

	/*
	 * Fill mesh with particles
	 * Filling is cut in parts to prevent from blocking the page
	 */
	fillMeshWithParticles()
	{
		// Prepare all needed objects to generate particles and project them
		const geometry = this.mesh.geometry

		// Bounding box of the mesh, center and size
		geometry.computeBoundingBox()
		const box = geometry.boundingBox

		let center = new THREE.Vector3()
		box.getCenter(center)

		let size = new THREE.Vector3()
		box.getSize(size)

		this.mesh.userData.shmMeshBBSize = size
		this.mesh.userData.shmMeshBBCenter = center

		this.fillPerfStart = performance.now()

		this.fillMeshWithParticlesFrame()
	}
	
	/*
	 * Display the summary of performances analysis
	 */
	performanceAnalysis()
	{
		console.log(" =========== ")
		console.log("[PERF] SHM build (get triangles, project them and store into SHM): " + this.perfSetupHSM.toFixed() + "ms")  // in milliseconds

		console.log(" =========== ")
		console.log("[PERF] Particle fill complete : " + this.perfFill.toFixed() + "ms")  // in milliseconds

		let percentProjParticle = Math.round(100 * this.perfProjParticle / this.perfFill)
		let percentRaycast = Math.round(100 * this.perfRaycast / this.perfFill)
		let percentSearchSHM = Math.round(100 * this.perfSearchHSM / this.perfFill)
		console.log("[PERF] Particle projection time : " + this.perfProjParticle.toFixed() + "ms (" + percentProjParticle + "%)")  // in milliseconds
		console.log("[PERF] SHM search time : " + this.perfSearchHSM.toFixed() + "ms (" + percentSearchSHM + "%)")  // in milliseconds
		console.log("[PERF] Raycast time : " + this.perfRaycast.toFixed() + "ms (" + percentRaycast + "%)")  // in milliseconds
	}

	/*
	 * Callback invoked when particle filling has complete
	 */
	onFillParticlesComplete()
	{
		// Draw particles
		this.drawParticles(this.particles, this.particleSize, this.particleColor, this.mesh)

		// Display the performance summary
		this.performanceAnalysis()

		// Launch animation
		this.animate()
	}

	/*
	 * Build spatial hashmap for the mesh
	 * It only works with BufferGeometry based objects
	 * 
	 * Create the RBush storing SHM data
	 * Set projection plane and direction
	 * Store these data into mesh userData obejct
	 * 
	 * Get all triangles defining the geometry indexed or non-indexed
	 * For each triangle, create a mesh, project it on the plane and store
	 * the triangle into the SHM with based on the AABB bounding box of the
	 * projected one
	 */
	buildMeshSHM()
	{
		// Benchmark start
		let t0 = performance.now()

		const mesh = this.mesh
		let geometry = mesh.geometry

		if (!geometry.isBufferGeometry)
		{
			throw "Only works with buffer geometry"
		}

		// SHM will be stored into the geometry userData
		// geometry.userData.shm = new SpatialHashMap(this.shmCellSize)
		geometry.userData.shm = new RBush()

		// All points will be projected in an orthographic way, on a plane stored into the geometry (to be used to project particles later)
		const planeNormal = new THREE.Vector3(0, 0, 1)
		geometry.userData.shmProjectionDirection = planeNormal

		const plane = new THREE.Plane(planeNormal, 30)
		geometry.userData.shmProjectionPlane = plane

		let triangles
		let indexBuffer = geometry.getIndex()
		if (indexBuffer === null)
		{
			triangles = this.getTrianglesForNonIndexedGeometry(geometry)
		}
		else
		{
			triangles = this.getTrianglesForIndexedGeometry(geometry)
		}

		triangles.forEach(triangle => {
			// Create a 3D mesh with the triangle
			let triangleGeometry = new THREE.BufferGeometry().setFromPoints([triangle.a, triangle.b, triangle.c])
			let triangleMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, opacity: 0.4, transparent: true, color: 0xffffff * Math.random()})
			let triangleMesh = new THREE.Mesh(triangleGeometry, triangleMaterial)

			// Compute the projection of the triangle
			let projA = new THREE.Vector3(),
				projB = new THREE.Vector3(),
				projC = new THREE.Vector3()

			plane.projectPoint(triangle.a, projA)
			plane.projectPoint(triangle.b, projB)
			plane.projectPoint(triangle.c, projC)

			const projectedTriangle = new THREE.Triangle(projA, projB, projC)

			// Draw projected triangles (debug purpose)
			this.drawTriangle(projectedTriangle, Math.random() * 0xffffff, 0.2, mesh)

			const aabb = this.getTriangleAABB(projectedTriangle)

			if (aabb.xmin == aabb.xmax)
			{
				aabb.xmax += 1
			}

			if (aabb.ymin == aabb.ymax)
			{
				aabb.ymax += 1
			}

			const item = {
				minX: aabb.xmin,
				minY: aabb.ymin,
				maxX: aabb.xmax,
				maxY: aabb.ymax,
				mesh: triangleMesh
			}

			geometry.userData.shm.insert(item)
		})

		// Benchmark end
		this.perfSetupHSM = (performance.now() - t0)
	}

	/*
	 * Get all triangles of the geometry (indexed version)
	 */
	getTrianglesForIndexedGeometry(geometry)
	{
		let triangles = []

		const positions = geometry.attributes["position"]	
		const indices = geometry.getIndex()

		const nTriangles = indices.count / 3
		for (let i=0; i<nTriangles; i++)
		{
			const i0 = indices.array[3 * i],
				  i1 = indices.array[3 * i + 1],
				  i2 = indices.array[3 * i + 2]

			let a = new THREE.Vector3(positions.array[3 * i0], positions.array[3 * i0 + 1], positions.array[3 * i0 + 2])
			let b = new THREE.Vector3(positions.array[3 * i1], positions.array[3 * i1 + 1], positions.array[3 * i1 + 2])
			let c = new THREE.Vector3(positions.array[3 * i2], positions.array[3 * i2 + 1], positions.array[3 * i2 + 2])

			let triangle = new THREE.Triangle(a, b, c)

			triangles.push(triangle)
		}

		return triangles
	}

	/*
	 * Get all triangles of the geometry (non-indexed version)
	 */
	getTrianglesForNonIndexedGeometry(geometry)
	{
		let triangles = []
		const positions = geometry.attributes["position"]	

		// Iterate over positions to get triangles
		const nTriangles = positions.count / 3
		for (let idx = 0; idx < nTriangles; idx++)
		{
			const ptA = new THREE.Vector3(
				positions.array[9 * idx],
				positions.array[9 * idx + 1],
				positions.array[9 * idx + 2])

			const ptB = new THREE.Vector3(
				positions.array[9 * idx + 3],
				positions.array[9 * idx + 4],
				positions.array[9 * idx + 5])
			
			const ptC = new THREE.Vector3(
				positions.array[9 * idx + 6],
				positions.array[9 * idx + 7],
				positions.array[9 * idx + 8])
			
			const triangle = new THREE.Triangle(ptA, ptB, ptC)
			triangles.push(triangle)
		}

		return triangles
	}

	/*
	 * get a 2D axis-aligned bounding box for a given triangle
	 * we assume the triangle lies into a z-constant plane and only keep x and y coordinates
	 */
	getTriangleAABB(triangle)
	{
		if (triangle.a.z !== triangle.b.z
 	 	 || triangle.a.z !== triangle.c.z
	     || triangle.b.z !== triangle.c.z)
		{
			throw "Impossible to get 2D AABB bounding box, triangle not in a z-constant plane"
		}

		let xmin = Math.min(Math.min(triangle.a.x, triangle.b.x), triangle.c.x)
		let xmax = Math.max(Math.max(triangle.a.x, triangle.b.x), triangle.c.x)

		let ymin = Math.min(Math.min(triangle.a.y, triangle.b.y), triangle.c.y)
		let ymax = Math.max(Math.max(triangle.a.y, triangle.b.y), triangle.c.y)

		return { xmin, xmax, ymin, ymax }
	}

	/*
	 * draw triangle
	 * specify color and opacity
	 * specify optional parent
	 */
	drawTriangle(triangle, color, opacity, opt_parent)
	{
		if (this.debug === false)
		{
			return
		}

		let normal = new THREE.Vector3()
		triangle.getNormal(normal)
		
		let tGeometry = new THREE.Geometry()
		tGeometry.vertices.push(triangle.a, triangle.b, triangle.c)
		tGeometry.faces.push( new THREE.Face3(0, 1, 2, normal))

		let tMaterial = new THREE.MeshBasicMaterial({
			side: THREE.DoubleSide,
			color: color,
			transparent: true,
			opacity: opacity
		})
		let tMesh = new THREE.Mesh( tGeometry, tMaterial )
		
		let parent = typeof opt_parent !== "undefined" ? opt_parent : this.scene
		parent.add(tMesh)
	}

	/*
	 * draw a ray for a given length
	 * specifying the color and opacity
	 */
	drawRay(ray, length, color, opacity)
	{
		if (this.debug === false)
		{
			return
		}
		
	    var pointB = new THREE.Vector3()
	    pointB.addVectors(ray.origin, ray.direction.multiplyScalar(length))

	    var geometry = new THREE.Geometry()
	    geometry.vertices.push(ray.origin, pointB)
	    
	    var material = new THREE.LineBasicMaterial({
	    	color: color,
	    	transparent:true,
	    	opacity: opacity
	    })

	    var line = new THREE.Line(geometry, material)
	    this.scene.add(line)
	}

	/*
	 * draw particles with a BufferGeometry and a PointsMaterial
	 * specify size and color of the particles
	 * specify optional parent object
	 */
	drawParticles(particles, size, color, opt_parent)
	{
		let particlesGeometry = new THREE.BufferGeometry()

		let positionAttr = new THREE.BufferAttribute(new Float32Array(particles.length), 3)
		particlesGeometry.setAttribute('position', positionAttr)

		let positions = particlesGeometry.getAttribute('position')
		positions.array = new Float32Array(particles)
		positions.setUsage(THREE.DynamicDrawUsage)

		let pointsMaterial = new THREE.PointsMaterial({size: size, color: color})
		let particlesMesh = new THREE.Points(particlesGeometry, pointsMaterial)

		let parent = typeof opt_parent === "undefined" ? this.scene : opt_parent
		parent.add(particlesMesh)
	}

	onMeshReady(mesh)
	{
		this.scene.add(mesh)

		// Stored mesh in context for ease the fill routine
		this.mesh = mesh

		// Build geometry spatial hashmap
		this.buildMeshSHM(mesh)

		// Fill the mesh with particles
		this.fillMeshWithParticles(mesh)
	}

	loadMesh(path)
	{
		let loader = new FBXLoader()
		
		function checkObject(object)
			{
				if (!object.isMesh) {
					return
				}

				object.material.dispose()
				object.material = new THREE.MeshBasicMaterial({
					color:0xffffff,
					transparent: true,
					opacity: 0.2
				})

				this.onMeshReady(object)
			}

		function onLoad(object)
		{
			object.traverse(checkObject.bind(this))
		}

		loader.load(path, onLoad.bind(this))
	}

	/*
	 * Create a mesh for the need of the demonstration
	 * It could also be loaded
	 */
	createMesh(type)
	{
		let shape
		let shapeSize = 20
		let shapeDetails = 6

		let shapeType = typeof type === "string" ? type.toLowerCase() : ""
		if (type === "octahedron")
		{
			shape = new THREE.OctahedronBufferGeometry(shapeSize, shapeDetails)
		}
		else if (type = "torusknot")
		{
			shape = new THREE.TorusKnotBufferGeometry(shapeSize, 0.4 * shapeSize, Math.pow(2, shapeDetails), Math.pow(2, shapeDetails))
		}
		else
		{
			shape = new THREE.BoxBufferGeometry(shapeSize, shapeSize, shapeSize)
		}

		let lineMaterial = new THREE.LineBasicMaterial({
			linewidth: 1,
			color: "#d0a020",
			transparent: true,
			opacity: this.meshOpacity
		})
		let mesh = new THREE.Line(shape, lineMaterial)

		this.onMeshReady(mesh)
	}

	/*
	 * render routine drawing the scene
	 */
	render()
	{
		this.renderer.render(this.scene, this.camera)				
	}

	/*
	 * animation routine, updating the logic and calling render routine
	 */
	animate()
	{
		let now = Date.now()
		let deltaTime = (now - this.lastTime) / 1000
		this.elapsedTime += deltaTime
		this.lastTime = now

		// Schedule next frame
		this.raf = window.requestAnimationFrame(this.animate.bind(this))

		if (this.autorotation === true)
		{
			var angle = this.elapsedTime * 2 * Math.PI / 30
			this.camera.position.set(40 * Math.cos(angle), 0, 40 * Math.sin(angle))
			this.camera.lookAt(new THREE.Vector3())
		}
		else
		{
			this.controls.update()
		}

		// Player rendering routine
		this.render()
	}

	/*
	 * start the animation
	 */
	start()
	{
		this.setupRendering()

		// this.createMesh("octahedron")
		this.createMesh("torusknot")
		// this.loadMesh("./models/raptor.fbx")
	}
}
