### 1.4.6 里程计案例\(Python\)

#### 1.源文件

功能包py00\_odom的py00\_odom目录下，新建Python文件odom2path\_py.py，并编辑文件，输入如下内容：

```py
"""  
    需求：订阅机器人的里程计数据，生成并发布机器人的运行轨迹。
    流程：
        1.导包；
        2.初始化ROS2客户端；
        3.自定义节点类；
          3-1.创建订阅方，订阅里程计消息；
          3-2.创建发布方，发布轨迹信息。          
        4.调用spin函数，并传入节点对象；
        5.资源释放。 


"""
# 1.导包；
import rclpy
from rclpy.node import Node
from nav_msgs.msg import Odometry
from nav_msgs.msg import Path
from geometry_msgs.msg import Pose
from geometry_msgs.msg import PoseStamped
import math

# 3.自定义节点类；
class Odom2PathPy(Node):
    def __init__(self):
        super().__init__("odom2path_node_py")
        self.poses = list() # 存储路径中途经点的列表
        self.last_pose = Pose() # 列表中的最后一个途经点
        self.append_last_pose() # 初始化操作，将原点添加进列表

        # 3-1.创建订阅方，订阅里程计消息；
        self.odom_sub = self.create_subscription(Odometry,"odom",self.odom_cb,10)
        # 3-2.创建发布方，发布轨迹信息。   
        self.path_pub = self.create_publisher(Path,"path",10)

    # 将点添加进列表   
    def append_last_pose(self):
        # 组织PoseStamped对象
        ps = PoseStamped()
        ps.header.stamp = self.get_clock().now().to_msg()
        ps.header.frame_id = "odom"
        ps.pose = self.last_pose
        # 添加进列表
        self.poses.append(ps)

    # 获取当前机器人位姿与最后一个途径点的直线距离
    def get_distance(self,current_pose):
        dx = current_pose.position.x - self.last_pose.position.x 
        dy = current_pose.position.y - self.last_pose.position.y 
        return math.sqrt(math.pow(dx,2) + math.pow(dy,2))

    # 发布路径信息
    def publish_path(self):
        # 组织 Path 数据
        path_msg = Path()
        path_msg.header.stamp = self.get_clock().now().to_msg()
        path_msg.header.frame_id = "odom"
        path_msg.poses = self.poses
        # 发布
        self.path_pub.publish(path_msg)

    def odom_cb(self, odom):
        # 获取当前位姿
        current_pose = odom.pose.pose
        # 判断距离
        distance = self.get_distance(current_pose)

        if distance >= 0.5:
            # 如果符合条件，那么将当前位姿赋值给last_pose，并添加进列表
            self.last_pose = current_pose
            self.append_last_pose()
        # 发布
        self.publish_path()


def main():
    # 2.初始化ROS2客户端；
    rclpy.init()
    # 4.调用spain函数，并传入节点对象；
    rclpy.spin(Odom2PathPy())
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
<depend>nav_msgs</depend>
<depend>geometry_msgs</depend>
```

##### 2.setup.py {#2setuppy}

setup.py文件中`entry_points`字段的`console_scripts`中添加如下内容：

```python
entry_points={
    'console_scripts': [
        'odom2path_py = py00_odom.odom2path_py:main'
    ],
},
```

#### 3.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select py00_odom
```

#### 4.执行

请先按照之前介绍，启动机器人底盘以及键盘控制节点。

然后在当前工作空间下，启动终端，并输入如下指令：

```
. install/setup.bash
ros2 run py00_odom odom2path_py
```

#### 5.使用rviz2查看结果

新建终端，输入如下指令：

```
rviz2
```

rviz2启动后，将参考坐标系设置为odom，添加Path插件并将话题设置为/path。当键盘控制机器人运动时，在rviz2中就会显示机器人的运动轨迹，其运行结果与演示案例类似。

