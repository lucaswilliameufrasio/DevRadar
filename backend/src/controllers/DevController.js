const parseStringAsArray = require("../utils/parseStringAsArray");
const getDevInformation = require("../utils/getDevInformation");
const { findConnections, sendMessage } = require("../websocket");
const { knex } = require("@/helpers/knex");
const { logger } = require("@/helpers/logger");
const { isNullOrUndefined } = require("@/helpers/validation");

//index: quando quero mostrar uma lista, show: quando quero mostrar um único registro, store: quando quero criar um registro, update: alterar registro,
//destroy: deletar um registro
module.exports = {
  async index(context) {
    const devs = await knex.table("devs").select("*");

    return context.json(
      devs.map((dev) => ({
        ...dev,
        _id: dev.id,
        techs: JSON.parse(dev.techs),
      }))
    );
  },

  async store(context) {
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
        console.log("body", context.req.body);
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
      const apiResponse = await getDevInformation(github_username);
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
      }
      sendMessage(sendSocketMessageTo, "new-dev", devMapped);

      return context.json(devMapped);
    } catch (error) {
      console.error("Error storing developer:", error);
      return context.json({ message: "Something went wrong" }, 500);
    }
  },

  async update(context) {
    const { latitude, longitude } = context.req.body;
    const developerId = context.req.param('dev_id');

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
      const apiResponse = await getDevInformation(github_username);
      const { name = github_username, avatar_url, bio } = apiResponse.data;

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
        .returning("*");

      return context.json({
        ...updatedDeveloper,
        _id: updatedDeveloper.id,
        techs: JSON.parse(updatedDeveloper.techs),
      });
    } catch (error) {
      logger.error("Failed to update dev", error);
      return context.json({ message: "Internal server error" }, 500);
    }
  },

  async destroy(context) {
    const dev_id = context.req.param('dev_id');

    const dev = await knex("devs").select("id").where("id", dev_id).first();

    if (!dev) {
      return context.json({ message: "User not found!" });
    }

    await knex("devs").select("id").where("id", dev_id).delete();

    return context.json({ message: "User deleted successfully!" });
  },
};
