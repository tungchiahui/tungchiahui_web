### 1.2.4 远程开发NoMachine\_环境搭建

#### 概念

NoMachine是一种高性能远程访问软件，使用户能够在不同设备之间共享和访问桌面环境。它提供了实时图形渲染和快速数据传输，以实现优质且流畅的远程体验。

使用NoMachine，我们可以通过互联网或局域网远程连接到其他计算机，并在远程桌面上像在本地一样进行工作。无论是访问自己的个人电脑，还是与远程团队协作，NoMachine都为用户提供了便捷的解决方案。

NoMachine支持跨平台操作，可在Windows、Mac、Linux和其他主要操作系统上运行。它还提供了诸如文件共享、剪贴板传输和打印机共享等附加功能，以方便用户在远程计算机上进行文件传输和协作。

总体而言，NoMachine是一款强大的远程访问工具，适用于个人用户和企业用户，提供了高性能和可靠的远程桌面体验。

#### 实现 {#实现}

使用NoMachine实现远程连接相对而言还是比较简单的，其具体操作流程如下：

1. 在本地主机和远程主机分别安装NoMachine；
2. 本地主机启动NoMachine连接远程主机。

##### 1.下载安装NoMachine {#1安装ssh客户端与服务端}

无论是本地主机还是远程主机，都需要安装NoMachine，请先访问NoMachine的官方下载链接：[https://downloads.nomachine.com/](https://downloads.nomachine.com/) 。在本地主机和远程主机根据各自的操作系统分别下载对应的安装包。

NoMachine针对Windows、Mac、Linux、Raspberry、ARM、IOS、Android等多种平台都提供了对应的安装包，我们可以按需自行选择。在本教程，本地主机使用的是Windows操作系统，远程主机使用的是Ubuntu操作系统，因此只针对这两种情况进行介绍。

注意：如果是Linux操作系统，那么可以使用如下指令查看系统架构，然后再选择对应的安装包：

```
dpkg --print-architecture
```

![](/assets/1.2.4_01NoMachine下载.png)

**1-1.Windows下安装NoMachine**

Windows下安装NoMachine只需要双击安装程序，按照引导一步步执行即可，并且安装完毕后，请重启操作系统。

**1-2.Ubuntu下安装NoMachine**

Ubuntu下当前下载的为DEB安装包，下载完毕，可以在下载目录下打开终端，执行如下指令进行安装：

```
sudo dpkg -i nomachine_8.8.1_1_amd64.deb
```

当然实操过程中，安装包的版本号可能会有所差异。

##### 2.启动并使用NoMachine

**2-1.准备连接**

在Windows端，双击启动NoMachine，默认情况下，界面中会显示当前网络内可连接的设备：

![](/assets/1.2.4_03NoMachine_启动.png)也可以点击Add按钮进入如下几面自行添加设备信息：

![](/assets/1.2.4_05NoMachine_添加连接信息.png)**2-2.连接**

选择要连接的设备，并点击Connect按钮。![](/assets/1.2.4_04NoMachine_连接.png)设置登录信息：![](/assets/1.2.4_06NoMachine_登录信息.png)**2-3.远程操作**

连接成功后，将打开远程桌面窗口。

![](/assets/1.2.4_06NoMachine_连接成功.png)至此，就可以像在本地一样操作远程桌面了。

