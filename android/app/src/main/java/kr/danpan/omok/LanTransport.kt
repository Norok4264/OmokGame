package kr.danpan.omok

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.BufferedReader
import java.io.BufferedWriter
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.system.measureNanoTime

internal class LanTransport(context: Context, private val onSnapshot: (JSONObject) -> Unit) : AutoCloseable {
    data class Peer(
        val id: String,
        val name: String,
        val serviceName: String,
        val address: InetAddress,
        val port: Int,
        val network: Network,
    )
    private data class WifiLink(val network: Network, val properties: LinkProperties)

    private val appContext = context.applicationContext
    private val prefs = appContext.getSharedPreferences("lan-profile", Context.MODE_PRIVATE)
    val localPlayerId: String = prefs.getString("playerId", null) ?: UUID.randomUUID().toString().also { prefs.edit().putString("playerId", it).apply() }
    private val nsd = appContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    private val connectivity = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val repository = LanGameRepository(appContext, localPlayerId)
    private val main = Handler(Looper.getMainLooper())
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    private val timer: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val closed = AtomicBoolean(false)
    private val peers = linkedMapOf<String, Peer>()
    private val resolving = hashSetOf<String>()
    private val wifiLinks = linkedMapOf<Network, LinkProperties>()
    private val wifiLock = Any()
    private val peerLock = Any()
    private val challengeLock = Any()
    private var outgoingUntil = 0L
    private val communicationLock = Any()
    private val communicationEvents = ArrayDeque<JSONObject>()
    private var serverSocket: ServerSocket? = null
    @Volatile private var clientSocket: Socket? = null
    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null
    private var multicastLock: WifiManager.MulticastLock? = null
    private var registrationOwned = false
    private val remoteRefreshInFlight = AtomicBoolean(false)
    @Volatile private var hostingRequested = false
    @Volatile private var registeredServiceName: String? = null
    @Volatile private var discoveryGeneration = 0
    @Volatile private var localStatus = "같은 Wi-Fi의 상대를 검색합니다."
    @Volatile private var remotePeer: Peer? = null
    @Volatile private var remoteToken: String? = null
    @Volatile private var remoteSnapshot: JSONObject? = null
    @Volatile private var remoteSessionReady = false
    private val remoteSessionGeneration = AtomicLong(0)
    @Volatile private var boundWifiAddress: String? = null
    @Volatile private var boundWifiNetwork: Network? = null
    @Volatile private var localNickname = "게스트"
    @Volatile private var dismissedGameId: String? = prefs.getString("dismissedGameId", null)
    @Volatile private var authorityPollCursor = 0
    @Volatile private var cachedSnapshot = JSONObject()

    private val wifiNetworkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            synchronized(wifiLock) { wifiLinks.putIfAbsent(network, LinkProperties()) }
            enqueueEndpointRefresh()
        }
        override fun onLinkPropertiesChanged(network: Network, linkProperties: LinkProperties) {
            synchronized(wifiLock) {
                if (connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true) wifiLinks[network] = linkProperties
            }
            enqueueEndpointRefresh()
        }
        override fun onLost(network: Network) {
            synchronized(wifiLock) { wifiLinks.remove(network) }
            enqueueEndpointRefresh()
        }
    }

    init {
        if (prefs.getString("sessionGameId", null) == null) {
            prefs.edit().remove("sessionPeerId").remove("sessionToken").remove("sessionChallengeId").apply()
        }
        remoteToken = prefs.getString("sessionToken", null)
        connectivity.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build(), wifiNetworkCallback)
        timer.scheduleAtFixedRate({
            if (closed.get()) return@scheduleAtFixedRate
            try {
                if (repository.expireDue()) publishSnapshot()
            } catch (error: Exception) { setStatus("SQLite 처리에 실패했습니다. 승인 전 상태는 공개하지 않았습니다. 앱을 다시 열어 주세요.") }
        }, 250, 250, TimeUnit.MILLISECONDS)
        timer.scheduleAtFixedRate({ sendHeartbeatIfNeeded() }, 15, 15, TimeUnit.SECONDS)
    }

    fun startHosting(displayName: String) {
        if (closed.get()) return
        if (hostingRequested) { startDiscovery(); publishSnapshot(); return }
        if (!hasWifi()) { setStatus("Wi-Fi 연결이 없습니다. 같은 일반 Wi-Fi에 연결한 뒤 다시 시도하세요."); return }
        synchronized(HostOwnership) {
            if (HostOwnership.owner != null && HostOwnership.owner !== this) { setStatus("이 기기에서 이미 LAN 호스트가 실행 중입니다."); return }
            HostOwnership.owner = this
            hostingRequested = true
        }
        io.execute {
            try {
                val profile = repository.configureLocal(displayName)
                localNickname = profile.optString("localNickname", "게스트")
                val route = wifiRoute() ?: error("Wi-Fi IPv4 경로를 찾지 못했습니다.")
                val address = route.properties.linkAddresses.map { it.address }.first { it is Inet4Address && !it.isLoopbackAddress }
                if (serverSocket?.isClosed == false && boundWifiAddress == address.hostAddress && boundWifiNetwork == route.network) {
                    startDiscovery()
                    publishSnapshot()
                    return@execute
                }
                val socket = ServerSocket().apply { reuseAddress = false; bind(InetSocketAddress(address, 0), 8); soTimeout = 1000 }
                if (closed.get() || !hostingRequested) { socket.close(); releaseOwnership(); return@execute }
                serverSocket = socket
                boundWifiAddress = address.hostAddress
                boundWifiNetwork = route.network
                registerService(socket.localPort)
                acceptLoop(socket)
            } catch (error: SecurityException) {
                hostingRequested = false; closeServer(); releaseOwnership()
                setStatus("Android 로컬 네트워크 접근이 거부되었습니다. 권한과 Wi-Fi 설정을 확인하세요.")
            } catch (error: Exception) {
                hostingRequested = false; closeServer(); releaseOwnership()
                setStatus("호스트 시작 실패: ${error.localizedMessage ?: error.javaClass.simpleName}")
            }
        }
        startDiscovery()
        publishSnapshot()
    }

    private fun registerService(port: Int) {
        val info = NsdServiceInfo().apply {
            serviceName = "Danpan-${UUID.randomUUID().toString().take(6)}"
            serviceType = LanProtocol.SERVICE_TYPE
            setPort(port)
            setAttribute("playerid", localPlayerId)
            setAttribute("nickname", localNickname)
            setAttribute("protocol", LanProtocol.SERVICE_PROTOCOL_VERSION)
        }
        registeredServiceName = info.serviceName
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {
                registeredServiceName = serviceInfo.serviceName
                if (closed.get() || !hostingRequested) { runCatching { nsd.unregisterService(this) }; return }
                registrationOwned = true
                setStatus("대국 호스트 준비 완료 · 상대 자동 검색 중")
            }
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                hostingRequested = false; registeredServiceName = null; closeServer(); releaseOwnership()
                setStatus("LAN 서비스 등록 실패 (NSD $errorCode). 게스트 Wi-Fi의 기기 격리를 확인하세요.")
            }
            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) { registrationOwned = false }
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) { setStatus("서비스 해제 확인 실패 (NSD $errorCode).") }
        }
        registrationListener = listener
        nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
    }

    fun startDiscovery() {
        if (closed.get()) return
        if (!hasWifi()) { setStatus("Wi-Fi 연결이 없습니다. 같은 Wi-Fi에 연결한 뒤 검색하세요."); return }
        stopDiscovery()
        val generation = discoveryGeneration
        synchronized(peerLock) { peers.clear(); resolving.clear() }
        val lock = wifi.createMulticastLock("danpan-omok-nsd").apply { setReferenceCounted(false); acquire() }
        multicastLock = lock
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) { setStatus("같은 Wi-Fi의 대기 중인 상대를 자동 검색 중입니다…") }
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                if (closed.get() || generation != discoveryGeneration || serviceInfo.serviceType?.trimEnd('.') != LanProtocol.SERVICE_TYPE.trimEnd('.')) return
                val serviceName = serviceInfo.serviceName ?: return
                synchronized(peerLock) {
                    if (serviceName == registeredServiceName || serviceName in resolving || peers.values.any { it.serviceName == serviceName }) return
                    resolving.add(serviceName)
                }
                @Suppress("DEPRECATION")
                nsd.resolveService(serviceInfo, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                        synchronized(peerLock) { resolving.remove(serviceName) }
                        if (!closed.get() && generation == discoveryGeneration) setStatus("상대 검색 결과를 확인하지 못했습니다 (NSD $errorCode). 다시 검색하세요.")
                    }
                    override fun onServiceResolved(resolved: NsdServiceInfo) {
                        if (closed.get() || generation != discoveryGeneration) return
                        val id = runCatching { resolved.attributes["playerid"]?.toString(Charsets.UTF_8) }.getOrNull().orEmpty()
                        val name = runCatching { resolved.attributes["nickname"]?.toString(Charsets.UTF_8) }.getOrNull().orEmpty()
                        val version = runCatching { resolved.attributes["protocol"]?.toString(Charsets.UTF_8) }.getOrNull()
                        if (id.isBlank() || name.isBlank() || id == localPlayerId || version != LanProtocol.SERVICE_PROTOCOL_VERSION) {
                            synchronized(peerLock) { resolving.remove(serviceName) }
                            if (version != null && version != LanProtocol.SERVICE_PROTOCOL_VERSION) setStatus("상대 앱 프로토콜 버전이 다릅니다. 두 기기를 같은 최신 앱으로 업데이트하세요.")
                            return
                        }
                        val route = wifiRoute() ?: return
                        val peer = Peer(id, name, resolved.serviceName ?: serviceName, resolved.host ?: return, resolved.port, route.network)
                        synchronized(peerLock) { resolving.remove(serviceName); peers[id] = peer }
                        if (id == prefs.getString("sessionPeerId", null)) {
                            selectRemotePeer(peer)
                            remoteToken = prefs.getString("sessionToken", remoteToken)
                            remoteSessionReady = false
                            localStatus = "상대 재접속 중 · 인증과 호스트 스냅샷 확인 전에는 착수할 수 없습니다."
                            main.post { refresh() }
                        }
                        publishSnapshot()
                    }
                })
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                val name = serviceInfo.serviceName ?: return
                val lostIds = synchronized(peerLock) {
                    val ids = peers.filterValues { it.serviceName == name }.keys.toSet()
                    peers.entries.removeAll { it.value.serviceName == name }
                    resolving.remove(name)
                    ids
                }
                if (remotePeer?.id?.let { it in lostIds } == true) {
                    remoteSessionReady = false
                    localStatus = "상대 서비스 연결이 끊겼습니다. 재접속 유예 중이며 이 기기에서 승패를 판정하지 않습니다."
                }
                publishSnapshot()
            }
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { stopDiscovery(); setStatus("상대 검색 실패 (NSD $errorCode). 같은 일반 Wi-Fi와 기기 격리를 확인하세요.") }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) { setStatus("상대 검색 종료 확인 실패 (NSD $errorCode).") }
        }
        discoveryListener = listener
        try { nsd.discoverServices(LanProtocol.SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener) }
        catch (error: SecurityException) { stopDiscovery(); setStatus("Android 로컬 네트워크 권한이 거부되었습니다. 시스템 설정에서 허용하세요.") }
        catch (error: Exception) { stopDiscovery(); setStatus("상대 검색 실패: ${error.localizedMessage ?: error.javaClass.simpleName}") }
    }

    fun createChallenge(peerId: String, nickname: String): Unit = synchronized(challengeLock) {
        val peer = peer(peerId) ?: return setStatus("선택한 상대가 사라졌습니다. 목록을 새로고침하세요.")
        val own = repository.snapshot()
        if (own.optJSONObject("challenge")?.optString("status") == "PENDING" || own.optJSONObject("game")?.optString("status") == "ACTIVE" || remotePeer != null) return setStatus("이미 신청 또는 대국이 진행 중입니다.")
        val name = try { if (nickname.isBlank()) "" else LanNickname.validate(nickname).display } catch (error: Exception) { return setStatus(error.message ?: "닉네임이 올바르지 않습니다.") }
        val token = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        val request = command("challenge.create", localPlayerId, "nickname" to name, "accessToken" to token)
        remoteSessionGeneration.incrementAndGet()
        remotePeer = peer; remoteToken = token; remoteSnapshot = null; remoteSessionReady = false
        outgoingUntil = android.os.SystemClock.elapsedRealtime() + 30_000
        prefs.edit().putString("sessionPeerId", peer.id).putString("sessionToken", token).apply()
        setStatus("대국 신청을 보내는 중…")
        val generation = remoteSessionGeneration.get()
        io.execute { performRemote(peer, request, token, expectedGeneration = generation) }
    }

    fun offerChallenge(peerId: String) {
        createChallenge(peerId, "")
    }

    fun respondChallenge(challengeId: String, accept: Boolean, revision: Int) {
        val remoteChallenge = remoteSnapshot?.optJSONObject("challenge")
        if (remoteChallenge?.optString("challengeId") == challengeId && remoteChallenge.optString("acceptorId") == localPlayerId) {
            val peer = remotePeer ?: return setStatus("신청 호스트 연결을 찾지 못했습니다. 다시 검색하세요.")
            val request = command(if (accept) "challenge.accept" else "challenge.decline", localPlayerId,
                "challengeId" to challengeId, "expectedRevision" to revision, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else {
            submitLocal(command(if (accept) "challenge.accept" else "challenge.decline", localPlayerId, "challengeId" to challengeId, "expectedRevision" to revision))
        }
    }

    fun cancelChallenge() {
        val remoteChallenge = remoteSnapshot?.optJSONObject("challenge")
        if (remoteChallenge?.optString("applicantId") == localPlayerId) {
            val peer = remotePeer ?: return setStatus("상대 연결 정보가 없습니다. 다시 검색하세요.")
            val request = command("challenge.cancel", localPlayerId, "challengeId" to remoteChallenge.optString("challengeId"), "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
            return
        }
        val localChallenge = repository.snapshot().optJSONObject("challenge")
        if (localChallenge?.optString("applicantId") == localPlayerId) submitLocal(command("challenge.cancel", localPlayerId, "challengeId" to localChallenge.optString("challengeId")))
        else setStatus("취소할 신청이 없습니다.")
    }

    fun submitMove(gameId: String, revision: Int, x: Int, y: Int) {
        val peer = remotePeer
        val state = remoteSnapshot
        if (peer != null && state?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("game.move", localPlayerId, "gameId" to gameId, "expectedRevision" to revision, "x" to x, "y" to y, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("game.move", localPlayerId, "gameId" to gameId, "expectedRevision" to revision, "x" to x, "y" to y))
    }

    fun resign(gameId: String, revision: Int) {
        val peer = remotePeer
        val state = remoteSnapshot
        if (peer != null && state?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("game.resign", localPlayerId, "gameId" to gameId, "expectedRevision" to revision, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("game.resign", localPlayerId, "gameId" to gameId, "expectedRevision" to revision))
    }

    fun submitChat(gameId: String, messageId: String, body: String) {
        val peer = remotePeer
        val state = remoteSnapshot
        val fields = arrayOf("gameId" to gameId, "messageId" to messageId, "body" to body)
        if (peer != null && state?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("chat.send", localPlayerId, *fields).put("accessToken", remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("chat.send", localPlayerId, *fields))
    }

    fun requestRematch(gameId: String) {
        val peer = remotePeer
        if (peer != null && remoteSnapshot?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("rematch.request", localPlayerId, "gameId" to gameId, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("rematch.request", localPlayerId, "gameId" to gameId))
    }

    fun respondRematch(gameId: String, rematchId: String, accept: Boolean) {
        val peer = remotePeer
        if (peer != null && remoteSnapshot?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("rematch.respond", localPlayerId, "gameId" to gameId, "rematchId" to rematchId, "accept" to accept, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("rematch.respond", localPlayerId, "gameId" to gameId, "rematchId" to rematchId, "accept" to accept))
    }

    fun cancelRematch(gameId: String, rematchId: String) {
        val peer = remotePeer
        if (peer != null && remoteSnapshot?.optJSONObject("game")?.optString("gameId") == gameId) {
            val request = command("rematch.cancel", localPlayerId, "gameId" to gameId, "rematchId" to rematchId, "accessToken" to remoteToken.orEmpty())
            val generation = remoteSessionGeneration.get()
            io.execute { performRemote(peer, request, remoteToken.orEmpty(), expectedGeneration = generation) }
        } else submitLocal(command("rematch.cancel", localPlayerId, "gameId" to gameId, "rematchId" to rematchId))
    }

    fun refresh() {
        var peer = remotePeer
        var token = remoteToken.orEmpty()
        if (peer == null) {
            publishSnapshot(); return
        }
        val remote = remoteSnapshot
        val challenge = remote?.optJSONObject("challenge")
        val game = remote?.optJSONObject("game")
        val fields = mutableListOf<Pair<String, Any?>>()
        if (token.isNotEmpty()) fields += "accessToken" to token
        val challengeId = challenge?.optString("challengeId")?.takeIf(String::isNotBlank)
            ?: prefs.getString("sessionChallengeId", null)
        val gameId = game?.optString("gameId")?.takeIf(String::isNotBlank)
            ?: prefs.getString("sessionGameId", null)
        if (challengeId != null) fields += "challengeId" to challengeId
        if (gameId != null) fields += "gameId" to gameId
        val request = command("snapshot", localPlayerId, *fields.toTypedArray())
        if (!remoteRefreshInFlight.compareAndSet(false, true)) return
        val target = peer
        val generation = remoteSessionGeneration.get()
        io.execute { try { performRemote(target, request, token, quiet = true, expectedGeneration = generation) } finally { remoteRefreshInFlight.set(false) } }
    }

    private fun sendHeartbeatIfNeeded() {
        if (closed.get()) return
        val peer = remotePeer ?: return
        val game = remoteSnapshot?.optJSONObject("game") ?: return
        val status = game.optString("status")
        val resultExpiry = game.optLong("resultRoomExpiresAtUtcMs", 0L)
        if (status != "ACTIVE" && !(status == "FINISHED" && resultExpiry > System.currentTimeMillis())) return
        val token = remoteToken ?: return
        val request = command("heartbeat", localPlayerId, "gameId" to game.optString("gameId"), "accessToken" to token)
        if (!remoteRefreshInFlight.compareAndSet(false, true)) return
        val generation = remoteSessionGeneration.get()
        io.execute { try { performRemote(peer, request, token, quiet = true, expectedGeneration = generation) } finally { remoteRefreshInFlight.set(false) } }
    }

    fun dismissResult(gameId: String) {
        dismissedGameId = gameId
        prefs.edit().putString("dismissedGameId", gameId).apply()
        publishSnapshot()
    }

    private fun submitLocal(request: JSONObject) {
        io.execute {
            recordCommunication(request, "LOCAL→HOST", request.toString().toByteArray(Charsets.UTF_8).size, null, null)
            val response = repository.handle(request, local = true)
            recordCommunication(request, "HOST→LOCAL", response.toString().toByteArray(Charsets.UTF_8).size, null, response)
            if (!response.optBoolean("ok")) setStatus(errorMessage(response.optString("error")))
            else setStatus("SQLite commit 완료 · revision ${response.optJSONObject("snapshot")?.optJSONObject("game")?.optInt("revision", 0) ?: ""}")
            publishSnapshot()
        }
    }

    private fun performRemote(peer: Peer, request: JSONObject, token: String, quiet: Boolean = false, expectedGeneration: Long) {
        val generation = expectedGeneration
        try {
            val response = try { rpc(peer, request) }
            catch (first: Exception) {
                if (request.optString("type") == "snapshot" || closed.get() || generation != remoteSessionGeneration.get()) throw first
                // The retry reuses the exact request ID and payload; it cannot create a second move.
                rpc(peer, JSONObject(request.toString()))
            }
            synchronized(challengeLock) {
            if (generation != remoteSessionGeneration.get() || remotePeer?.id?.let { it != peer.id } == true) return
            if (request.optString("type") == "challenge.create" && !response.optBoolean("ok")) {
                clearRemoteSession()
                setStatus(errorMessage(response.optString("error")))
                return
            }
            val snapshot = response.optJSONObject("snapshot")
            if (snapshot != null && response.optString("error") != "NOT_AUTHORIZED") {
                remoteSnapshot = snapshot
                snapshot.optJSONObject("challenge")?.takeIf { it.optString("applicantId") == localPlayerId }
                    ?.optString("applicantName")?.takeIf { it.isNotBlank() }?.let { localNickname = it }
                remotePeer = peer
                remoteSessionReady = true
                snapshot.optJSONObject("challenge")?.optString("challengeId")?.takeIf(String::isNotBlank)?.let { prefs.edit().putString("sessionChallengeId", it).apply() }
                snapshot.optJSONObject("game")?.optString("gameId")?.takeIf(String::isNotBlank)?.let { prefs.edit().putString("sessionGameId", it).apply() }
                snapshot.optJSONObject("challenge")?.optString("invitationToken")?.takeIf { it.isNotBlank() && it != "null" }?.let {
                    remoteToken = it
                    prefs.edit().putString("sessionPeerId", peer.id).putString("sessionToken", it).apply()
                }
            }
            if (!response.optBoolean("ok")) {
                if (!quiet) setStatus(errorMessage(response.optString("error")) + " · 최신 상태를 다시 확인했습니다.")
            } else if (!quiet) setStatus("호스트가 SQLite commit 후 승인했습니다.")
            val challenge = remoteSnapshot?.optJSONObject("challenge")
            if (remoteSnapshot?.optJSONObject("game") == null && challenge != null && challenge.optString("status") != "PENDING") clearRemoteSession()
            publishSnapshot()
            }
        } catch (error: Exception) {
            if (generation != remoteSessionGeneration.get()) return
            remoteSessionReady = false
            localStatus = "호스트 연결이 끊겼습니다. 이 기기에서는 승패를 만들지 않습니다. 재접속 후 호스트 스냅샷을 기다립니다."
            if (!quiet) setStatus("호스트 응답을 확인하지 못했습니다. 같은 대국 상태를 다시 조회하세요. (${error.localizedMessage ?: error.javaClass.simpleName})")
            else publishSnapshot()
        }
    }

    private fun rpc(peer: Peer, request: JSONObject): JSONObject {
        val socket = peer.network.socketFactory.createSocket()
        clientSocket = socket
        try {
            socket.connect(InetSocketAddress(peer.address, peer.port), 4000)
            socket.soTimeout = 4000
            val writer = BufferedWriter(OutputStreamWriter(socket.getOutputStream(), Charsets.UTF_8))
            val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
            val outgoing = JSONObject(request.toString()).put("protocol", LanProtocol.VERSION)
            val outgoingBytes = outgoing.toString().toByteArray(Charsets.UTF_8).size
            val started = android.os.SystemClock.elapsedRealtimeNanos()
            writer.write(outgoing.toString()); writer.write("\n"); writer.flush()
            recordCommunication(outgoing, "TX", outgoingBytes, null, null)
            val line = readBoundedLine(reader) ?: error("호스트가 응답하지 않았습니다.")
            require(line.toByteArray(Charsets.UTF_8).size <= LanProtocol.MAX_LINE_CHARS) { "응답이 허용 크기를 넘었습니다." }
            val response = JSONObject(line)
            require(response.optString("protocol") == LanProtocol.VERSION) { "상대 앱 버전이 호환되지 않습니다." }
            val rttMs = (android.os.SystemClock.elapsedRealtimeNanos() - started) / 1_000_000.0
            recordCommunication(outgoing, "RX", line.toByteArray(Charsets.UTF_8).size, rttMs, response)
            return response
        } finally { runCatching { socket.close() }; if (clientSocket === socket) clientSocket = null }
    }

    private fun acceptLoop(socket: ServerSocket) {
        Thread {
            while (!closed.get() && !socket.isClosed) {
                try { socket.accept().use { handleRequest(it) } }
                catch (_: SocketTimeoutException) { }
                catch (error: Exception) { if (!closed.get()) setStatus("LAN 요청을 처리하지 못했습니다: ${error.localizedMessage ?: error.javaClass.simpleName}") }
            }
        }.apply { name = "danpan-lan-accept"; isDaemon = true; start() }
    }

    private fun handleRequest(socket: Socket) {
        socket.soTimeout = 4000
        val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
        val line = readBoundedLine(reader) ?: return
        require(line.toByteArray(Charsets.UTF_8).size <= LanProtocol.MAX_LINE_CHARS) { "요청이 허용 크기를 넘었습니다." }
        val input = JSONObject(line)
        require(input.optString("protocol") == LanProtocol.VERSION) { "상대 앱 버전이 호환되지 않습니다." }
        require(input.optString("requestId").length in 8..80) { "요청 ID가 올바르지 않습니다." }
        recordCommunication(input, "RX", line.toByteArray(Charsets.UTF_8).size, null, null)
        val response = synchronized(challengeLock) {
            if (input.optString("type") != "challenge.create") repository.handle(input)
            else {
                val actor = input.optString("actorId")
                val crossed = remotePeer?.id == actor && outgoingUntil > android.os.SystemClock.elapsedRealtime()
                if (!LanChallengePolicy.acceptIncoming(localPlayerId, actor, remotePeer?.id, crossed)) {
                    JSONObject().put("ok", false).put("error", "CHALLENGE_IN_PROGRESS")
                } else {
                    val accepted = repository.handle(input)
                    if (accepted.optBoolean("ok") && crossed) clearRemoteSession()
                    accepted
                }
            }
        }
        val writer = BufferedWriter(OutputStreamWriter(socket.getOutputStream(), Charsets.UTF_8))
        val responseLine = JSONObject(response.toString()).put("protocol", LanProtocol.VERSION).toString()
        writer.write(responseLine); writer.write("\n"); writer.flush()
        recordCommunication(input, "TX", responseLine.toByteArray(Charsets.UTF_8).size, null, response)
        publishSnapshot()
    }

    private fun command(type: String, actor: String, vararg fields: Pair<String, Any?>): JSONObject = JSONObject()
        .put("type", type).put("actorId", actor).put("requestId", UUID.randomUUID().toString())
        .apply { fields.forEach { (key, value) -> put(key, value) } }

    fun currentSnapshot(): JSONObject {
        val snapshot = JSONObject(cachedSnapshot.toString())
        snapshot.put("status", localStatus)
            .put("sessionReady", if (remotePeer == null) hostingRequested else remoteSessionReady)
            .put("communicationEvents", communicationSnapshot())
        if (remotePeer != null && !remoteSessionReady) {
            snapshot.optJSONObject("game")?.takeIf { it.optString("status") == "ACTIVE" }
                ?.put("inputBlockedReason", "호스트 인증과 최신 스냅샷을 확인할 때까지 입력을 잠급니다.")
        }
        return snapshot
    }

    private fun communicationSnapshot(): org.json.JSONArray = org.json.JSONArray().apply {
        synchronized(communicationLock) { communicationEvents.forEach { put(JSONObject(it.toString())) } }
    }

    private fun recordCommunication(payload: JSONObject, direction: String, byteCount: Int, rttMs: Double?, response: JSONObject?) {
        val wireType = payload.optString("type", "message")
        val event = JSONObject().put("type", if (response == null) wireType else "$wireType.response").put("direction", direction)
            .put("atUtcMs", System.currentTimeMillis()).put("payloadBytes", byteCount)
        if (payload.has("x") && payload.has("y")) event.put("coordinate", "${payload.optInt("x")},${payload.optInt("y")}")
        response?.optJSONObject("snapshot")?.optJSONObject("game")?.let { event.put("revision", it.optInt("revision")) }
        if (payload.has("expectedRevision")) event.put("expectedRevision", payload.optInt("expectedRevision"))
        listOf("requestId", "gameId", "challengeId", "rematchId", "messageId").forEach { key ->
            payload.optString(key).takeIf { it.isNotBlank() && it != "null" }?.let { event.put(key, it.take(8)) }
        }
        if (wireType == "chat.send") {
            val body = payload.optString("body")
            event.put("chatLength", body.codePointCount(0, body.length))
        }
        if (rttMs != null) event.put("applicationRttMs", (rttMs * 100.0).toLong() / 100.0)
        synchronized(communicationLock) {
            communicationEvents.addLast(event)
            while (communicationEvents.size > 200) communicationEvents.removeFirst()
        }
    }

    fun stopForUser() {
        runCatching { repository.stopForSystemReason() }
        stopDiscovery()
        hostingRequested = false
        val listener = registrationListener; registrationListener = null
        if (listener != null && registrationOwned) runCatching { nsd.unregisterService(listener) }
        registrationOwned = false; registeredServiceName = null; closeServer(); releaseOwnership()
        remoteSessionGeneration.incrementAndGet()
        remotePeer = null; remoteToken = null; remoteSnapshot = null; remoteSessionReady = false
        localNickname = "게스트"
        prefs.edit().remove("sessionPeerId").remove("sessionToken").remove("sessionChallengeId").remove("sessionGameId").remove("dismissedGameId").apply()
        setStatus("LAN 연결을 종료했습니다. 권위 호스트의 진행 중인 대국은 무효 처리했습니다.")
    }

    fun refreshAfterResume() {
        if (remotePeer != null) {
            remoteSessionGeneration.incrementAndGet()
            remoteSessionReady = false
            localStatus = "재접속 인증 중 · 호스트 스냅샷 확인 전에는 착수할 수 없습니다."
            val snapshot = currentSnapshot()
            main.post { if (!closed.get()) onSnapshot(snapshot) }
        }
        refresh()
        publishSnapshot()
    }

    private fun buildSnapshot(): JSONObject {
        val own = runCatching { repository.snapshot() }.getOrElse { JSONObject() }
        val remote = remoteSnapshot
        val peersJson = org.json.JSONArray().apply {
            synchronized(peerLock) { peers.values.sortedBy { it.name }.forEach { peer ->
                put(JSONObject().put("id", peer.id).put("name", peer.name).put("authority", remotePeer?.id == peer.id))
            } }
        }
        val payload = JSONObject().put("status", localStatus).put("devicePlayerId", localPlayerId).put("deviceNickname", localNickname)
            .put("authority", remotePeer?.id ?: localPlayerId)
            .put("isAuthority", remotePeer == null && (own.optJSONObject("challenge")?.optString("status") == "PENDING" || own.optJSONObject("game") != null))
            .put("sessionReady", if (remotePeer == null) hostingRequested else remoteSessionReady)
            .put("peers", peersJson).put("communicationEvents", communicationSnapshot())
        val source = remote ?: own
        val game = source.optJSONObject("game")
        if (game?.optString("status") == "ACTIVE" && remotePeer != null && !remoteSessionReady) {
            game.put("inputBlockedReason", "호스트 인증과 최신 스냅샷을 확인할 때까지 입력을 잠급니다.")
        }
        payload.put("challenge", source.opt("challenge") ?: JSONObject.NULL)
            .put("game", if (game?.optString("gameId") == dismissedGameId) JSONObject.NULL else game ?: JSONObject.NULL)
        return payload
    }

    private fun publishSnapshot() {
        if (closed.get()) return
        io.execute {
            if (closed.get()) return@execute
            val payload = buildSnapshot()
            cachedSnapshot = JSONObject(payload.toString())
            main.post { if (!closed.get()) onSnapshot(payload) }
        }
    }

    private fun refreshNetworkEndpoint() {
        if (closed.get() || !hostingRequested) return
        val route = wifiRoute()
        val address = route?.properties?.linkAddresses?.map { it.address }
            ?.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }?.hostAddress
        if (address == boundWifiAddress && route?.network == boundWifiNetwork) return
        boundWifiAddress = address
        boundWifiNetwork = route?.network
        stopDiscovery()
        val listener = registrationListener; registrationListener = null
        if (listener != null && registrationOwned) runCatching { nsd.unregisterService(listener) }
        registrationOwned = false; registeredServiceName = null; closeServer()
        if (address == null) {
            localStatus = "Wi-Fi가 끊겼습니다. 게임 시계는 계속 진행되며 같은 Wi-Fi 복귀를 기다립니다."
            publishSnapshot()
            return
        }
        try {
            val activeRoute = route
            val bindAddress = activeRoute.properties.linkAddresses.map { it.address }.first { it.hostAddress == address }
            val socket = ServerSocket().apply { reuseAddress = false; bind(InetSocketAddress(bindAddress, 0), 8); soTimeout = 1000 }
            serverSocket = socket
            registerService(socket.localPort)
            acceptLoop(socket)
            startDiscovery()
            setStatus("Wi-Fi 주소가 바뀌었습니다. 권위 호스트와 재접속을 확인합니다.")
        } catch (error: Exception) {
            setStatus("Wi-Fi 복귀 후 LAN 서비스를 열지 못했습니다. 같은 Wi-Fi와 권한을 확인하세요: ${error.localizedMessage ?: error.javaClass.simpleName}")
        }
    }

    private fun enqueueEndpointRefresh() {
        if (closed.get()) return
        runCatching { io.execute { refreshNetworkEndpoint() } }
    }

    private fun setStatus(value: String) { localStatus = value; publishSnapshot() }

    private fun selectRemotePeer(peer: Peer) {
        val current = remotePeer
        if (current == null || current.id != peer.id || current.address != peer.address || current.port != peer.port || current.network != peer.network) {
            remoteSessionGeneration.incrementAndGet()
        }
        remotePeer = peer
    }
    private fun clearRemoteSession() {
        remoteSessionGeneration.incrementAndGet()
        remotePeer = null; remoteToken = null; remoteSnapshot = null; remoteSessionReady = false; outgoingUntil = 0
        prefs.edit().remove("sessionPeerId").remove("sessionToken").remove("sessionChallengeId").remove("sessionGameId").apply()
    }
    private fun errorMessage(code: String): String = when (code) {
        "NICKNAME_IN_USE" -> "이 호스트에서 이미 사용 중인 닉네임입니다. 다른 이름을 입력하세요."
        "NICKNAME_LENGTH", "NICKNAME_CHARACTERS", "NICKNAME_RESERVED" -> code
        "CHALLENGE_IN_PROGRESS", "GAME_IN_PROGRESS" -> "이미 대기 중인 신청 또는 진행 중인 대국이 있습니다."
        "CHALLENGE_EXPIRED" -> "신청 응답 시간이 지났습니다. 상대를 다시 선택하세요."
        "RESULT_ROOM_EXPIRED" -> "결과방 5분이 끝났습니다. 대기 화면에서 새 대국을 시작하세요."
        "ONLY_LOSER_CAN_REQUEST_REMATCH" -> "패자만 재도전을 요청할 수 있습니다."
        "ONLY_WINNER_CAN_RESPOND" -> "승자만 재도전을 승낙하거나 거부할 수 있습니다."
        "REMATCH_NOT_PENDING", "REMATCH_ALREADY_CLOSED" -> "재도전 요청이 이미 처리되었거나 만료되었습니다."
        "REMATCH_COOLDOWN" -> "재도전 종료 뒤 10초가 지나면 다시 요청할 수 있습니다."
        "ONLY_REQUESTER_CAN_CANCEL_REMATCH" -> "재도전 요청자만 취소할 수 있습니다."
        "CHAT_LENGTH" -> "채팅은 공백만 제외하고 1~200글자여야 합니다."
        "CHAT_RATE_LIMIT" -> "5초 동안 보낼 수 있는 메시지 수를 넘었습니다. 잠시 뒤 다시 보내세요."
        "CHAT_READ_ONLY" -> "대국이 끝나 채팅은 읽기 전용입니다."
        "MESSAGE_ID_CONFLICT" -> "같은 메시지 ID로 다른 내용이 전송되어 거절했습니다."
        "STALE_REVISION", "STALE_CHALLENGE_REVISION" -> "상태가 바뀌었습니다. 최신 화면을 불러왔습니다."
        "REQUEST_ID_CONFLICT" -> "같은 요청 ID에 다른 내용이 들어와 요청을 거절했습니다."
        "WRONG_TURN" -> "현재 차례의 참가자가 아닙니다."
        "OCCUPIED" -> "해당 교차점은 이미 점유되었습니다."
        "OUT_OF_BOUNDS" -> "보드 밖 좌표라 착수를 거절했습니다."
        "NOT_AUTHORIZED", "NOT_GAME_PARTICIPANT" -> "이 대국 참가 권한이 없습니다."
        "STORAGE_UNAVAILABLE" -> "저장에 실패했습니다. 승인된 상태는 화면에 반영하지 않았습니다."
        "AUTHORITY_ELECTION" -> "상대의 기기 ID가 권한 호스트입니다. 상대 기기에서 이 기기에 신청하세요."
        else -> code.ifBlank { "LAN 요청을 처리하지 못했습니다." }
    }

    private fun peer(id: String): Peer? = synchronized(peerLock) { peers[id] }
    private fun hasWifi(): Boolean = synchronized(wifiLock) { wifiLinks.keys.any { connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true } }
    private fun wifiRoute(): WifiLink? = synchronized(wifiLock) {
        wifiLinks.entries.firstNotNullOfOrNull { (network, properties) ->
            val isWifi = connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true
            if (isWifi && properties.linkAddresses.any { it.address is Inet4Address && !it.address.isLoopbackAddress }) WifiLink(network, properties) else null
        }
    }
    private fun readBoundedLine(reader: BufferedReader): String? {
        val text = StringBuilder()
        while (text.length <= LanProtocol.MAX_LINE_CHARS) {
            val code = reader.read()
            if (code == -1) return if (text.isEmpty()) null else text.toString()
            if (code == '\n'.code) return text.toString().trimEnd('\r')
            text.append(code.toChar())
        }
        error("메시지가 허용 크기를 넘었습니다.")
    }

    fun stopDiscovery() {
        discoveryGeneration++
        val listener = discoveryListener; discoveryListener = null
        if (listener != null) runCatching { nsd.stopServiceDiscovery(listener) }
        multicastLock?.let { runCatching { if (it.isHeld) it.release() } }; multicastLock = null
    }
    fun stopHosting() {
        if (runCatching { repository.snapshot().optJSONObject("game")?.optString("status") == "ACTIVE" }.getOrDefault(false)) {
            setStatus("대국 중에는 호스트를 종료할 수 없습니다. 대국을 마친 뒤 나가세요."); return
        }
        hostingRequested = false
        val listener = registrationListener; registrationListener = null
        if (listener != null && registrationOwned) runCatching { nsd.unregisterService(listener) }
        registrationOwned = false; registeredServiceName = null; closeServer(); releaseOwnership()
        remotePeer = null; remoteToken = null; remoteSnapshot = null
        setStatus("호스트와 상대 검색을 종료했습니다.")
    }
    private fun closeServer() { runCatching { serverSocket?.close() }; serverSocket = null }
    private fun releaseOwnership() { synchronized(HostOwnership) { if (HostOwnership.owner === this) HostOwnership.owner = null } }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        stopDiscovery()
        val listener = registrationListener; registrationListener = null
        if (listener != null && registrationOwned) runCatching { nsd.unregisterService(listener) }
        registrationOwned = false; hostingRequested = false
        runCatching { clientSocket?.close() }; clientSocket = null; closeServer(); releaseOwnership()
        runCatching { connectivity.unregisterNetworkCallback(wifiNetworkCallback) }
        timer.shutdownNow(); io.shutdownNow(); repository.close()
    }

    private object HostOwnership { var owner: LanTransport? = null }
}
