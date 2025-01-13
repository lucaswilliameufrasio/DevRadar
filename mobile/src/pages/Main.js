import React, { useEffect, useState } from 'react';
import { StyleSheet, Image, View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView } from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { requestForegroundPermissionsAsync, getCurrentPositionAsync } from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';

import api from '../services/api';
import { connect, disconnect, subscribeToNewDevs } from '../services/socket';

function Main({ navigation }) {
    const [developers, setDevelopers] = useState([]);
    const [currentRegion, setCurrentRegion] = useState(null);
    const [techs, setTechs] = useState('');

    useEffect(() => {
        async function loadInitialPosition() {
            try {
                const { granted } = await requestForegroundPermissionsAsync();
                console.log('Location permission was granted?', granted)

                if (granted) {
                    const { coords } = await getCurrentPositionAsync({
                        enableHighAccuracy: true,
                    });

                    const { latitude, longitude } = coords;

                    setCurrentRegion({
                        latitude,
                        longitude,
                        latitudeDelta: 0.04,
                        longitudeDelta: 0.04,
                    });
                }
            } catch (error) {
                console.error('Failed to load initial position', error);

                setCurrentRegion({
                    latitude: 0,
                    longitude: 0,
                    latitudeDelta: 0.04,
                    longitudeDelta: 0.04,
                });
            }
        }

        loadInitialPosition();
    }, []);

    useEffect(() => {
        subscribeToNewDevs((developer) => {
            console.debug('New developer in the house', developer)

            if (!developer) {
                return
            }

            setDevelopers([...developers, developer])
        }
        );
    }, [developers]);

    function setupWebsocket() {
        disconnect();

        const { latitude, longitude } = currentRegion;

        connect(
            latitude,
            longitude,
            techs,
        );
    }

    async function loadDevs() {
        try {
            console.debug("Loading devs")
            if (!currentRegion) {
                console.log('Current location is not set');
                return;
            }

            const { latitude, longitude } = currentRegion;
            console.debug("Current region", latitude, longitude)

            const response = await api.get('/search', {
                params: {
                    latitude,
                    longitude,
                    techs
                }
            });
            console.debug("Devs loaded response", response.status, response.data)

            setDevelopers(response.data.devs);
            setupWebsocket();
        } catch (error) {
            console.error('Failed to load devs', error)
        }
    }

    function handleRegionChanged(region) {
        setCurrentRegion(region);
    }

    if (!currentRegion) {
        return <Text>Algo de errado não está certo</Text>;
    }

    return (
        <>
            <MapView
                onRegionChangeComplete={handleRegionChanged}
                initialRegion={currentRegion}
                style={styles.map}>
                {developers.map((dev) => (
                    <Marker
                        key={dev._id}
                        coordinate={{
                            longitude: dev.location.coordinates[0],
                            latitude: dev.location.coordinates[1],
                        }}
                    >
                        <Image
                            style={styles.avatar}
                            source={{
                                uri: dev.avatar_url
                            }}
                        />

                        <Callout onPress={() => {
                            navigation.navigate('Profile', { github_username: dev.github_username })
                        }}>
                            <View style={styles.callout}>
                                <Text style={styles.devName}>{dev.name}</Text>
                                <Text style={styles.devBio}>{dev.bio}</Text>
                                <Text style={styles.devTechs}>{dev.techs.join(', ')}</Text>
                            </View>
                        </Callout>
                    </Marker>
                ))}
            </MapView>

            <KeyboardAvoidingView
                style={styles.searchFlexBox}
                behavior="padding"
                keyboardVerticalOffset={Constants.statusBarHeight + 70}
            >
                <View style={styles.searchForm} >
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar devs por techs..."
                        placeholderTextColor="#999"
                        autoCapitalize="words"
                        autoCorrect={false}
                        value={techs}
                        onChangeText={setTechs}
                    />
                    <TouchableOpacity onPress={loadDevs} style={styles.loadButton}>
                        <MaterialIcons name="my-location" size={20} color="#FFF" />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </>
    );
}

const styles = StyleSheet.create({
    map: {
        flex: 1,
    },
    avatar: {
        width: 54,
        height: 54,
        borderRadius: 4,
        borderWidth: 4,
        borderColor: '#FFF',
    },
    callout: {
        width: 260,
    },
    devName: {
        fontWeight: 'bold',
        fontSize: 16,
    },
    devBio: {
        color: '#666',
        marginTop: 5,
    },
    devTechs: {
        marginTop: 5,
    },
    searchFlexBox: {
        flex: 1,
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        zIndex: 5,
        justifyContent: 'flex-end',
    },
    searchForm: {
        // top: 20,
        flexDirection: 'row',
    },
    searchInput: {
        flex: 1,
        height: 50,
        backgroundColor: "#FFF",
        color: "#333",
        borderRadius: 25,
        paddingHorizontal: 20,
        fontSize: 16,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowOffset: {
            width: 4,
            height: 4,
        },
        elevation: 2,
    },
    loadButton: {
        width: 50,
        height: 50,
        backgroundColor: "#8E4DFF",
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 15,
    }
})

export default Main;