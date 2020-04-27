# Volpar - Volumetric particles
## Particles injection into a volume defined by a 3D mesh

Injection is done by adding random particles in world space and check whether it is inside or outside the mesh

I used some orthographic projection on a z-constant plane for each triangle of the mesh. Then I used the AABB boxes of the projected triangles to store the triangles into a spatial hashmap

Once the spatial hashmap is ready, I create particles by generating random positions in the bounding box of the mesh. The point is projected in the same orthographic way and the position on the projection plane allows to retrieve a set of triangles from the map.

Finally cast a ray from the particle to the plane and count intersections with the triangles of the mesh from the set.

If the count is odd, the particle is outside the mesh and is discarded
If the count is even, the particle is inside the mesh and is kept



## Improvements
+ Improve the initial bounding volume
+ Rewrite a leightweight raycast algorithm to improve performances
+ Add memory measurment to avoid OOM errors


## External dependencies
- THREE.js for 3D graphics management
- RBush for spatial hashmap usage
- FileSaver.js for file saving


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
npm install --save-dev rbush three file-saver
```

Run build

```
npm run dev
```

Once done, the project is located in the dist/ folder. Just load it through some http connection with a local web server.
