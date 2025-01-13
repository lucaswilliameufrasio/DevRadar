const axios = require("axios");
const parseStringAsArray = require("../utils/parseStringAsArray");
const getDevInformation = require("../utils/getDevInformation");
const { findConnections, sendMessage } = require("../websocket");
const { knex } = require("@/helpers/knex");
const { logger } = require("@/helpers/logger");
const { isNullOrUndefined } = require("@/helpers/validation");

//index: quando quero mostrar uma lista, show: quando quero mostrar um único registro, store: quando quero criar um registro, update: alterar registro,
//destroy: deletar um registro
module.exports = {
  async index(req, res) {
    const devs = await knex.table("devs").select("*");

    return res.json(
      devs.map((dev) => ({
        ...dev,
        _id: dev.id,
        techs: JSON.parse(dev.techs),
      }))
    );
  },

  async store(req, res) {
    try {
      const { github_username, techs, latitude, longitude } = req.body;

      // Validate input
      if (
        !github_username?.length ||
        !techs?.length ||
        isNullOrUndefined(latitude) ||
        isNullOrUndefined(longitude)
      ) {
        console.log("body", req.body);
        return res.status(422).json({ message: "Missing parameters" });
      }

      // Check if developer already exists
      const foundDeveloper = await knex("devs")
        .where({ github_username })
        .first();

      if (foundDeveloper) {
        return res.json({
          ...foundDeveloper,
          _id: foundDeveloper.id,
          techs: JSON.parse(foundDeveloper.techs),
        });
      }

      // Fetch GitHub information
      const apiResponse = await getDevInformation(github_username);
      const { name = github_username, avatar_url, bio } = apiResponse.data;

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

      return res.json(devMapped);
    } catch (error) {
      console.error("Error storing developer:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  },

  async update(request, response) {
    const { latitude, longitude } = request.body;
    const { dev_id } = request.params;

    try {
      // Check if the dev exists
      const foundDeveloper = await knex
        .table("devs")
        .where({ id: dev_id })
        .first();

      if (!foundDeveloper) {
        return response.status(404).json({ message: "User not found!" });
      }

      const { github_username } = foundDeveloper;

      // Fetch GitHub information
      const apiResponse = await getDevInformation(github_username);
      const { name = github_username, avatar_url, bio } = apiResponse.data;

      // Update the dev record
      const updatedDeveloper = await knex
        .table("devs")
        .where({ id: dev_id })
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

      return res.json({
        ...updatedDeveloper,
        _id: updatedDeveloper.id,
        techs: JSON.parse(updatedDeveloper.techs),
      });
    } catch (error) {
      logger.error("Failed to update dev", error);
      return response.status(500).json({ message: "Internal server error" });
    }
  },

  async destroy(req, res) {
    const { dev_id } = req.params;

    const dev = await knex("devs").select("id").where("id", dev_id).first();

    if (!dev) {
      return res.json({ message: "User not found!" });
    }

    await knex("devs").select("id").where("id", dev_id).delete();

    return res.json({ message: "User deleted successfully!" });
  },
};
