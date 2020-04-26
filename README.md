# Volpar - Volumetric particles
## Particles injection into a volume defined by a 3D mesh

Insertion is done by adding random particles in world space and check whether it is inside or outside the mesh

Use some orthographic projection on a z-constant plane for each triangle of the mesh. Use AABB boxes to create coordinates and inject triangles into a spatial hashmap linked to the mesh

Create particles by generating a randomly positioned point in the bounding box of the mesh. Then project the particle in the same way to get the list of triangles in front and behind it.
Finally cast a ray from the particle to the plane and count intersections with the triangles of the mesh.
If the count is odd, the particle is outside the mesh and is discarded
If the count is even, the particle is inside the mesh and is kept


## Improvements
+ Write a JSON exporter to keep the BufferGeometry and reuse it (make this project some offline helper)
+ Improve the initial bounding volume
+ Rewrite a leightweight raycast algorithm to improve performances


## External dependencies
- THREE.js for 3D graphics management
- RBush for spatial hashmap usage


## Dev envrionment
Build system relies on webpack

Install tools

```
npm install --save-dev webpack webpack-cli
npm install -D babel-loader @babel/core @babel/preset-env webpack
npm install copy-webpack-plugin --save-dev
```

Resolve dependencies

```
npm install --save-dev rbush three
```

Run

```
npm run dev
```
