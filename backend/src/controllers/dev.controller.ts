import { parseStringAsArray } from "../helpers/data-manipulation";
import { findGithubProfileByUsername } from "../helpers/github";
import { findConnections, sendMessage } from "../websocket";
import { knex } from "@/helpers/knex";
import { logger } from "@/helpers/logger";
import { isNullOrUndefined } from "@/helpers/validation";
import { Context } from "hono";

export = {
  async index(context: Context) {
    const devs = await knex.table("devs").select("*");

    return context.json(
      devs.map((dev) => ({
        ...dev,
        _id: dev.id,
        techs: JSON.parse(dev.techs),
      }))
    );
  },

  async store(context: Context) {
    try {
      const body = await context.req.json();
      const { github_username, techs, latitude, longitude } = body;

      // Validate input
      if (
        !github_username?.length ||
        !techs?.length ||
        isNullOrUndefined(latitude) ||
        isNullOrUndefined(longitude)
      ) {
        console.log("Invalid request body", body);
        return context.json({ message: "Missing parameters" }, 422);
      }

      // Check if developer already exists
      const foundDeveloper = await knex("devs")
        .where({ github_username })
        .first();

      if (foundDeveloper) {
        return context.json({
          ...foundDeveloper,
          _id: foundDeveloper.id,
          techs: JSON.parse(foundDeveloper.techs),
        });
      }

      // Fetch GitHub information
      const apiResponse = await findGithubProfileByUsername(github_username);
      const { name = github_username, avatar_url, bio } = apiResponse;

      // Parse techs into an array
      const techsArray = parseStringAsArray(techs);

      // Create the developer record
      const [createdDeveloperId] = await knex("devs").insert({
        github_username,
        name: name ?? "",
        avatar_url,
        bio: bio ?? "",
        techs: JSON.stringify(techsArray), // Store the techs array as JSON
        latitude,
        longitude,
      });

      // Fetch the newly created developer
      const createdDeveloper = await knex("devs")
        .where({ id: createdDeveloperId })
        .first();

      // Find connections and send socket message
      const sendSocketMessageTo = findConnections(
        { latitude, longitude },
        techsArray
      );

      const devMapped = {
        ...createdDeveloper,
        _id: createdDeveloper.id,
        techs: JSON.parse(createdDeveloper.techs),
        location: {
          coordinates: [createdDeveloper.longitude, createdDeveloper.latitude],
        },
      };
      sendMessage(sendSocketMessageTo, "new-dev", devMapped);

      return context.json(devMapped);
    } catch (error) {
      console.error("Error storing developer:", error);
      return context.json({ message: "Something went wrong" }, 500);
    }
  },

  async update(context: Context) {
    const { latitude, longitude } = await context.req.json();
    const developerId = context.req.param("dev_id");

    try {
      // Check if the dev exists
      const foundDeveloper = await knex
        .table("devs")
        .where({ id: developerId })
        .first();

      if (!foundDeveloper) {
        return context.json({ message: "User not found!" }, 404);
      }

      const { github_username } = foundDeveloper;

      // Fetch GitHub information
      const apiResponse = await findGithubProfileByUsername(github_username);
      const { name = github_username, avatar_url, bio } = apiResponse;

      // Update the dev record
      const updatedDeveloper = await knex
        .table("devs")
        .where({ id: developerId })
        .update({
          name,
          avatar_url,
          bio,
          location: JSON.stringify({
            type: "Point",
            coordinates: [longitude, latitude],
          }),
        })
        .returning<{
          id: number,
          techs: string
        }>("*");

      return context.json({
        ...updatedDeveloper,
        _id: updatedDeveloper.id,
        techs: JSON.parse(updatedDeveloper.techs),
      });
    } catch (error) {
      logger.error("Failed to update developer", error);
      return context.json({ message: "Internal server error" }, 500);
    }
  },

  async destroy(context: Context) {
    const dev_id = context.req.param("dev_id");

    const dev = await knex("devs").select("id").where("id", dev_id).first();

    if (!dev) {
      return context.json({ message: "User not found!" });
    }

    await knex("devs").select("id").where("id", dev_id).delete();

    return context.json({ message: "User deleted successfully!" });
  },
};
