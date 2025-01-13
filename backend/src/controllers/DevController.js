const axios = require('axios');
const Dev = require('../models/Dev');
const parseStringAsArray = require('../utils/parseStringAsArray');
const getDevInformation = require('../utils/getDevInformation');
const { findConnections, sendMessage } = require('../websocket');

//index: quando quero mostrar uma lista, show: quando quero mostrar um único registro, store: quando quero criar um registro, update: alterar registro,
//destroy: deletar um registro
module.exports = {
    async index(req, res) {
        const devs = await Dev.find();

        return res.json(devs);
    },

    async store(req, res) {
        try {
            const { github_username, techs, latitude, longitude } = req.body;

            if (!github_username?.length || !techs?.length || !latitude || !longitude) {
                return res.status(422).json({ message: 'Missing parameters' })
            }

            const foundDeveloper = await Dev.findOne({ github_username });

            if (foundDeveloper) {
                return res.json(foundDeveloper)
            }

            const apiResponse = await getDevInformation(github_username);

            const { name = login, avatar_url, bio } = apiResponse.data;

            const techsArray = parseStringAsArray(techs);

            const location = {
                type: 'Point',
                coordinates: [longitude, latitude],
            }

            const createdDeveloper = await Dev.create({
                github_username,
                name,
                avatar_url,
                bio,
                techs: techsArray,
                location,
            });

            const sendSocketMessageTo = findConnections(
                { latitude, longitude },
                techsArray,
            )

            sendMessage(sendSocketMessageTo, 'new-dev', createdDeveloper);

            return res.json(createdDeveloper);
        } catch (error) {
            return res.status(500).json({ message: 'Something went wrong' })
        }
    },

    async update(req, res) {
        //Atualizar nome, avatar, bio e localização
        const { latitude, longitude } = req.body;

        const { dev_id } = req.params;

        let dev = await Dev.findById(dev_id);

        if (!dev) {
            return res.json({ message: 'User not found!' });
        }

        const { github_username } = dev;

        const apiResponse = await getDevInformation(github_username);

        const { name = login, avatar_url, bio } = apiResponse.data;

        const location = {
            type: 'Point',
            coordinates: [longitude, latitude],
        }

        await dev.updateOne({
            $set: {
                name: name,
                avatar_url: avatar_url,
                bio: bio,
                location: location
            }
        });

        dev = await Dev.findById(dev_id);

        return res.json(dev);
    },

    async destroy(req, res) {
        const { dev_id } = req.params;

        const dev = await Dev.findById(dev_id);

        if (!dev) {
            return res.json({ message: 'User not found!' });
        }

        await Dev.deleteOne({ _id: dev_id });

        return res.json({ message: 'User deleted successfully!' })
    }
};