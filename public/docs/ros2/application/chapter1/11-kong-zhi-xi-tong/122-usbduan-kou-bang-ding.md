### 1.3.2 USB端口绑定

在Ubuntu系统中，接入USB设备时，会为之生成对应的端口号，我们可以通过端口号访问该设备，但是这个过程可能会存在一些问题。在此，我们还需要了解一下生成端口号的基本规则。

* 如果在Ubuntu系统已经启动的情况下，接入USB设备，那么会按照接入顺序对设备的端口进行递增式编号。比如现依次接入设备A、设备B、设备C......，那么按照先后顺序，A对应的端口号为`/dev/ttyUSB0`，B对应的端口号为`/dev/ttyUSB1`，C对应的端口号为`/dev/ttyUSB2`，以此类推；
* 如果USB设备已经接入完毕，然后启动Ubuntu系统，那么不同设备对应的端口号就有或然性了，每次启动Ubuntu系统，同一USB设备对应的端口号可能是不一样的，具有随机性；
* 另外，当重新插拔USB设备时，其端口号也会发生改变。

换言之，在Ubuntu系统中，默认情况下，USB设备与端口号之间不存在硬绑定。而当使用USB设备对应的驱动时，驱动程序又必须根据端口号连接USB设备，这意味着，由于端口号的不确定性，如果不采取任何措施，那么每次启动程序可能就要手动修改需要关联的端口号。这种方式虽然是可行的，但是显然也缺乏灵活性。那么应该如何优化呢？

常用的优化策略有两种：

1. 根据USB设备绑定端口；
2. 根据主机硬件绑定端口。

两种策略的实现上，本质都是设置一个映射规则：摒弃USB设备本来的端口号，找出USB设备的“标识“或主机接口的“标识”，再根据“标识”绑定一个特定名称（别名）。对于调用者而言当操作某个设备时，直接调用别名即可，而无需关注别本来的端口号。接下来我们就介绍一下两种方式的具体实现细节，以及各自存在的缺点。

#### 1.根据USB设备绑定端口

**需求：**Ubuntu系统中现接入雷达和智能车底盘两台USB设备，请为二者绑定端口。

**实现原理：**可以通过USB设备本身的“标识”实现端口绑定。

**流程如下：**

（1）.查找设备idVendor和idProduct

接入两个USB设备，在终端调用指令`lsusb`查看显示系统中以及连接到系统的USB设备信息。

![](/assets/1.2.2_01lsusb查看USB设备信息.PNG)

如上图所示，红色方框内数据为两台USB设备的idVendor和idProduct（两个参数之间使用”：“分隔）。

另外：可以通过重新插拔比较的方式确定哪些数据对应接入的USB设备。

（2）.编写映射规则

在`/etc/udev/rule.d`目录下新建文件xxx.rules（文件名自定义），输入如下内容：

```
KERNEL=="ttyUSB*", ATTRS{idVendor}=="10c4", ATTRS{idProduct}=="ea60", MODE:="0777", SYMLINK+="mylidar"
KERNEL=="ttyUSB*", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="7523", MODE:="0777", SYMLINK+="mycar"
```

代码解释：

* KERNEL是内核固定名称，这里统一是“ttyUSB\*”；
* MODE是节点权限，通常改为“0777”，表示可读写可运行；
* SYMLINK是符号连接，即绑定的别名；
* ATTRS是设备厂商的唯一标识，idVendor和idProduct正好组成上面通过lsusb查找到的设备ID。

_**小提示：**一般的USB设备供应商都会提供类似的脚本文件，对于调用者而言，直接复制该文件到_`/etc/udev/rule.d`_目录即可。_

（3）.使规则生效

在终端下输入如下指令：

```
sudo service udev reload
sudo service udev restart
```

再重新插拔设备即可。

（4）.测试

终端下输入如下指令`ll /dev | grep ttyUSB`，运行结果如下：

![](/assets/1.2.2_02映射结果.PNG)

也可以多次插拔USB设备，会发现设备端口`ttyUSBn`中的n编号会变动，但是别名是始终可以指向对应的USB设备的。至此，就可以使用别名来关联所需使用的USB设备了。

**缺点：**

上述实现也存在一定的局限性，当Ubuntu接入两台或多台相同型号的USB设备时，由于设备ID是一样的，该种实现方式只会对其中的一台设备生效，这种情况下，就需要通过第二种策略来实现端口的绑定了。

#### 2.根据主机硬件绑定端口

**需求：**无人车中现接入一前一后两台相同型号的雷达，请为二者绑定端口。

**实现原理：**USB设备所连接主机的USB接口也是有其“标识”的，可以通过这个标识实现端口绑定。

**流程如下：**

（1）.查看所连接的主机USB接口的KERNELS

调用如下指令查看第一台雷达的USB信息：

```
udevadm info --attribute-walk --name=/dev/ttyUSB0 | grep KERNELS
```

![](/assets/1.2.2_03查看USB0的KERNELS.PNG)

调用如下指令查看第二台雷达的USB信息：

```
udevadm info --attribute-walk --name=/dev/ttyUSB1 | grep KERNELS
```

![](/assets/1.2.2_04查看USB1的KERNELS.PNG)

运行结果相比较不同的KERNELS，第一台雷达端口地址为`KERNELS==1-1.3:1.0`，第二个雷达端口地址为`KERNELS==1-1.4:1.0`。可以使用此数据作为不同端口的“唯一性标识”。

（2）.编写映射规则

在`/etc/udev/rule.d`目录下新建文件xxx.rules（文件名自定义），输入如下内容：

```
KERNEL=="ttyUSB*", KERNELS=="1-1.3:1.0", MODE:="0777", SYMLINK+="rplidar_front"
KERNEL=="ttyUSB*", KERNELS=="1-1.4:1.0", MODE:="0777", SYMLINK+="rplidar_back"
```

（3）.使规则生效

在终端下输入如下指令：

```
sudo service udev reload
sudo service udev restart
```

再重新插拔设备即可。

（4）.测试

终端下输入如下指令`ll /dev | grep ttyUSB`，运行结果如下：

![](/assets/1.2.2_05映射结果.PNG)

至此，就可以使用别名来关联所需使用的USB设备了。

**缺点：**USB设备必须连接在主机的指定端口上，否则，会导致端口绑定失败，或产生逻辑错误。

#### 3.其他说明

并非所有的USB设备端口号都是`ttyUSBn`的格式，比如Arduino的端口号可能是`ttyACMn`，而对于USB摄像头而言，一台设备则对应两个端口号，分别是`videon`和`video(n+1)`，并且启用摄像头设备一般使用的是`videon`端口，绑定时需要关联的也是该接口。

但是无论是外接何种USB设备，也不管采用上述两种方案的哪一种进行端口绑定，其原理都是类似的，只是实现细节不同而已。如果是外接的Arduino设备，那么需要在rules文件中的将`KERNEL=="ttyUSB*"`修改为`KERNEL=="ttyACM*"`，如果外接的是USB摄像头，那么则需要在rules文件中的将`KERNEL=="ttyUSB*"`修改为类似于`KERNEL=="video[0,2,4,6]"`的格式，其中`video[0,2,4,6]`表示可以绑定的端口为`video0`或`video2`或`video4`或`video6`。

