import * as THREE from "three"


class Utils {

	static disposeScene(scene)
	{
		scene.traverse(mesh => Utils.disposeObject(mesh))
	}

	static disposeArray()
	{
		this.array = null;
	}

	static disposeObject(object)
	{
		if (typeof object === "undefined" || object === null)
		{
			return
		}

		if (typeof object === "object")
		{
			for (const property in object)
			{	
				// Ignore parent tree up and down as it's managed by traverse call
				if (property === "parent" || property === "children")
				{
					continue
				}

				Utils.disposeObject(object[property])
			}			
		}

		if (typeof object.dispose === "function")
		{
			console.log("Dispose: " + object.type)
			object.dispose()
			object = null
		}
	}
}

export const disposeScene = Utils.disposeScene;
export const disposeArray = Utils.set;
export const disposeObject = Utils.remove;