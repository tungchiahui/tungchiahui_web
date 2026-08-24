### 1.8.5 GNSS案例\(Python\)

#### 1.源文件

功能包py05\_gnss的py05\_gnss目录下，新建Python文件gnss2path\_py.py，并编辑文件，输入如下内容：

```py
# 1.导包；
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import NavSatFix
from nav_msgs.msg import Path 
from geometry_msgs.msg import PoseStamped

# 3.自定义节点类；
class Gnss2PathPy(Node):
    def __init__(self):
        super().__init__("gnss2path_node_py")
        # 是否是起点
        self.is_origin = True
        # 轨迹对象
        self.path = Path()
        self.path.header.frame_id = "gnss_link"
        # 经度与纬度的分辨率
        self.declare_parameter("lo_resulation",0.000008983)
        self.declare_parameter("la_resulation",0.000008993)
        self.lo_resulation = self.get_parameter("lo_resulation").value
        self.la_resulation = self.get_parameter("la_resulation").value
        self.gnss_sub = self.create_subscription(NavSatFix,"gps/fix",self.gnss_cb,10)
        self.path_pub = self.create_publisher(Path,"gnss_path",10)
    def gnss_cb(self,gnss: NavSatFix):
        self.path.header.stamp = self.get_clock().now().to_msg()
        # 每订阅到一条gnss消息，就创建轨迹中的一PoseStamped
        ps = PoseStamped()
        ps.header.stamp = self.get_clock().now().to_msg()
        ps.header.frame_id = "gnss_link"
        # 第一次订阅的坐标点作为path的起点，后续的坐标点以此为参考
        if self.is_origin:
            # 获取初始经纬度与海拔
            self.origin_lo = gnss.longitude
            self.origin_la = gnss.latitude
            self.origin_al = gnss.altitude
            self.is_origin = False
        else:
            # 根据经纬度海拔的变换，计算出 x y z 三轴位移并设置进 ps。
            # 获取当前点相对于原点的经纬度与海拔的差值。
            delta_lo = gnss.longitude - self.origin_lo
            delta_la = gnss.latitude - self.origin_la
            delta_al = gnss.altitude - self.origin_al
            # 根据经度计算x位移
            ps.pose.position.x = delta_lo / self.lo_resulation
            # 根据纬度计算y位移
            ps.pose.position.y = delta_la / self.la_resulation
            # 直接把海拔差值作为z位移
            ps.pose.position.z = delta_al

        self.path.poses.append(ps)
        self.path_pub.publish(self.path)
def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(Gnss2PathPy())
    # 5.资源释放。 
    rclpy.shutdown()

if __name__ == '__main__':
    main()
```

#### 2.编辑配置文件

##### 1.package.xml {#1packagexml}

在创建功能包时，所依赖的功能包已经自动配置了，配置内容如下：

```xml
<depend>rclpy</depend>
<depend>sensor_msgs</depend>
<depend>nav_msgs</depend>
<depend>geometry_msgs</depend>
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
        'console_scripts': [
            'gnss2path_py = py05_gnss.gnss2path_py:main'
        ],
    },
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py05_gnss
```

#### 4.执行

在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py05_gnss gnss2path_py
```

终端下进入bag文件所属的目录，调用如下指令回放bag文件：

```
ros2 bag play gps_bag02
```

其中，`gps_bag02`需要替换为你自己的bag文件。

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为gnss\_link，添加Path插件并将话题设置为/gnss\_path。接下来就会在rviz2中就会显示机器人的运动轨迹了，其运行结果与演示案例类似。

